"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayClient = void 0;
const ws_1 = __importDefault(require("ws"));
const MAX_RECONNECT_DELAY_MS = 30000;
const INITIAL_RECONNECT_DELAY_MS = 1000;
class RelayClient {
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.ws = null;
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this.disposed = false;
        this.messageHandlers = [];
        this._connected = false;
        this.statusCallback = null;
    }
    get connected() {
        return this._connected;
    }
    /** Register a callback for connection state changes. */
    onStatusChange(cb) {
        this.statusCallback = cb;
    }
    /** Register a handler for incoming messages from the relay. */
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    /** Connect to the relay and authenticate. */
    connect(relayUrl, sessionId) {
        this.dispose(); // close any existing connection
        this.disposed = false;
        const wsUrl = relayUrl.replace(/^http/, 'ws') + '/ws';
        this.log(`Connecting to ${wsUrl}...`);
        this.ws = new ws_1.default(wsUrl);
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
            }
            catch {
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
    send(data) {
        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    /** Disconnect and stop reconnecting. */
    disconnect() {
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
    dispose() {
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
    scheduleReconnect(relayUrl, sessionId) {
        if (this.disposed)
            return;
        this.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
        this.reconnectTimer = setTimeout(() => {
            if (!this.disposed) {
                this.connect(relayUrl, sessionId);
            }
        }, this.reconnectDelay);
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    }
    log(msg) {
        this.outputChannel.appendLine(`[RelayClient] ${msg}`);
    }
}
exports.RelayClient = RelayClient;
//# sourceMappingURL=relay-client.js.map