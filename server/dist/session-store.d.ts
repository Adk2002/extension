import { ActiveSession } from './types';
export declare class SessionStore {
    private pairingSessions;
    private activeSessions;
    private cleanupTimer;
    constructor();
    /** Generate a new pairing session. Returns the code + sessionId + expiresAt. */
    createPairing(): {
        code: string;
        sessionId: string;
        expiresAt: string;
    };
    /** PWA joins with a code. Returns sessionId or null if invalid/expired. */
    joinByCode(code: string): string | null;
    /** Get an active session by sessionId. */
    getSession(sessionId: string): ActiveSession | undefined;
    /** Remove an active session. */
    removeSession(sessionId: string): void;
    /** Clean up expired pairing sessions. */
    private cleanupExpired;
    /** Generate a random numeric code. */
    private generateCode;
    dispose(): void;
}
//# sourceMappingURL=session-store.d.ts.map