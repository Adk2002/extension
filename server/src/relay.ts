import WebSocket from 'ws';
import { SessionStore } from './session-store';
import { AuthMessage, ClientToServerMessage } from './types';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface TaggedSocket extends WebSocket {
  isAlive?: boolean;
  sessionId?: string;
  role?: 'extension' | 'pwa';
}

export class Relay {
  private wss: WebSocket.Server;
  private heartbeatTimer: ReturnType<typeof setInterval>;

  constructor(
    server: import('http').Server,
    private sessionStore: SessionStore,
  ) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws: TaggedSocket) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('message', (raw) => this.handleMessage(ws, raw));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('error', () => this.handleDisconnect(ws));
    });

    // Heartbeat: close dead connections
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.wss.clients as Set<TaggedSocket>) {
        if (!client.isAlive) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private handleMessage(ws: TaggedSocket, raw: WebSocket.RawData): void {
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this.send(ws, { type: 'auth:error', message: 'Invalid JSON' });
      return;
    }

    // First message must be auth
    if (msg.type === 'auth') {
      this.handleAuth(ws, msg as AuthMessage);
      return;
    }

    // All other messages require authenticated session
    if (!ws.sessionId || !ws.role) {
      this.send(ws, { type: 'auth:error', message: 'Not authenticated' });
      return;
    }

    // Relay message to the paired peer
    this.relayToPeer(ws);
    const session = this.sessionStore.getSession(ws.sessionId);
    if (!session) return;

    const peer = ws.role === 'extension' ? session.pwaSocket : session.extensionSocket;
    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(raw.toString());
    }
  }

  private handleAuth(ws: TaggedSocket, msg: AuthMessage): void {
    const { sessionId, role } = msg;

    if (!sessionId || !role || !['extension', 'pwa'].includes(role)) {
      this.send(ws, { type: 'auth:error', message: 'Invalid auth payload' });
      return;
    }

    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      this.send(ws, { type: 'auth:error', message: 'Session not found' });
      return;
    }

    // Attach socket to session
    if (role === 'extension') {
      // Close existing extension socket if reconnecting
      if (session.extensionSocket && session.extensionSocket !== ws) {
        try { session.extensionSocket.close(); } catch { /* ignore */ }
      }
      session.extensionSocket = ws;
    } else {
      if (session.pwaSocket && session.pwaSocket !== ws) {
        try { session.pwaSocket.close(); } catch { /* ignore */ }
      }
      session.pwaSocket = ws;
    }

    ws.sessionId = sessionId;
    ws.role = role;

    this.send(ws, { type: 'auth:ok' });

    // Notify the peer that the other side connected
    const peer = role === 'extension' ? session.pwaSocket : session.extensionSocket;
    if (peer && peer.readyState === WebSocket.OPEN) {
      this.send(peer, { type: 'pair:connected' });
    }
  }

  private handleDisconnect(ws: TaggedSocket): void {
    if (!ws.sessionId || !ws.role) return;

    const session = this.sessionStore.getSession(ws.sessionId);
    if (!session) return;

    // Clear socket reference
    if (ws.role === 'extension' && session.extensionSocket === ws) {
      session.extensionSocket = null;
    } else if (ws.role === 'pwa' && session.pwaSocket === ws) {
      session.pwaSocket = null;
    }

    // Notify peer of disconnect
    const peer = ws.role === 'extension' ? session.pwaSocket : session.extensionSocket;
    if (peer && peer.readyState === WebSocket.OPEN) {
      this.send(peer, { type: 'pair:disconnected' });
    }
  }

  /** Unused relay helper — the actual relay is in handleMessage above. */
  private relayToPeer(_ws: TaggedSocket): void {
    // no-op: relay is handled inline in handleMessage
  }

  private send(ws: WebSocket, data: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  dispose(): void {
    clearInterval(this.heartbeatTimer);
    this.wss.close();
  }
}
