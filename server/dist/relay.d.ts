import { SessionStore } from './session-store';
export declare class Relay {
    private sessionStore;
    private wss;
    private heartbeatTimer;
    constructor(server: import('http').Server, sessionStore: SessionStore);
    private handleMessage;
    private handleAuth;
    private handleDisconnect;
    /** Unused relay helper — the actual relay is in handleMessage above. */
    private relayToPeer;
    private send;
    dispose(): void;
}
//# sourceMappingURL=relay.d.ts.map