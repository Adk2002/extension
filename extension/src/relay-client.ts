import WebSocket from 'ws';
import * as vscode from 'vscode';

type MessageHandler = (msg: any) => void;

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export class RelayClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private messageHandlers: MessageHandler[] = [];
  private _connected = false;

  private statusCallback: ((connected: boolean) => void) | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private outputChannel: vscode.OutputChannel,
  ) {}

  get connected(): boolean {
    return this._connected;
  }

  /** Register a callback for connection state changes. */
  onStatusChange(cb: (connected: boolean) => void): void {
    this.statusCallback = cb;
  }

  /** Register a handler for incoming messages from the relay. */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /** Connect to the relay and authenticate. */
  connect(relayUrl: string, sessionId: string): void {
    this.dispose(); // close any existing connection
    this.disposed = false;

    const wsUrl = relayUrl.replace(/^http/, 'ws') + '/ws';
    this.log(`Connecting to ${wsUrl}...`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.log('Connected. Authenticating...');
      this.send({ type: 'auth', sessionId, role: 'extension' });
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'auth:ok') {
          this._connected = true;
          this.log('Authenticated successfully.');
          this.statusCallback?.(true);
          return;
        }
        if (msg.type === 'auth:error') {
          this.log(`Auth error: ${msg.message}`);
          return;
        }

        // Dispatch to handlers
        for (const handler of this.messageHandlers) {
          handler(msg);
        }
      } catch {
        this.log('Failed to parse message from relay');
      }
    });

    this.ws.on('close', () => {
      this._connected = false;
      this.statusCallback?.(false);
      this.log('Disconnected from relay.');
      this.scheduleReconnect(relayUrl, sessionId);
    });

    this.ws.on('error', (err) => {
      this.log(`WebSocket error: ${err.message}`);
    });
  }

  /** Send a JSON message to the relay server. */
  send(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /** Disconnect and stop reconnecting. */
  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.statusCallback?.(false);
    // Clear stored session
    this.context.globalState.update('sessionId', undefined);
    this.log('Disconnected and session cleared.');
  }

  /** Clean up resources. */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  private scheduleReconnect(relayUrl: string, sessionId: string): void {
    if (this.disposed) return;

    this.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed) {
        this.connect(relayUrl, sessionId);
      }
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private log(msg: string): void {
    this.outputChannel.appendLine(`[RelayClient] ${msg}`);
  }
}
