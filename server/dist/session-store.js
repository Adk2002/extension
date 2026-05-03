"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const uuid_1 = require("uuid");
const PAIRING_CODE_LENGTH = 6;
const PAIRING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
class SessionStore {
    constructor() {
        this.pairingSessions = new Map(); // code → session
        this.activeSessions = new Map(); // sessionId → session
        this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
    }
    /** Generate a new pairing session. Returns the code + sessionId + expiresAt. */
    createPairing() {
        const code = this.generateCode();
        const sessionId = (0, uuid_1.v4)();
        const now = Date.now();
        const expiresAt = now + PAIRING_TTL_MS;
        const session = {
            sessionId,
            code,
            createdAt: now,
            expiresAt,
        };
        this.pairingSessions.set(code, session);
        // Pre-create the active session so the extension can connect immediately
        this.activeSessions.set(sessionId, {
            sessionId,
            extensionSocket: null,
            pwaSocket: null,
        });
        return {
            code,
            sessionId,
            expiresAt: new Date(expiresAt).toISOString(),
        };
    }
    /** PWA joins with a code. Returns sessionId or null if invalid/expired. */
    joinByCode(code) {
        const session = this.pairingSessions.get(code);
        if (!session)
            return null;
        if (Date.now() > session.expiresAt) {
            this.pairingSessions.delete(code);
            return null;
        }
        // Code is consumed after successful join
        this.pairingSessions.delete(code);
        return session.sessionId;
    }
    /** Get an active session by sessionId. */
    getSession(sessionId) {
        return this.activeSessions.get(sessionId);
    }
    /** Remove an active session. */
    removeSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }
    /** Clean up expired pairing sessions. */
    cleanupExpired() {
        const now = Date.now();
        for (const [code, session] of this.pairingSessions) {
            if (now > session.expiresAt) {
                this.pairingSessions.delete(code);
            }
        }
    }
    /** Generate a random numeric code. */
    generateCode() {
        let code;
        do {
            const array = new Uint32Array(1);
            // Use crypto for secure random
            require('crypto').getRandomValues(array);
            code = String(array[0] % 10 ** PAIRING_CODE_LENGTH).padStart(PAIRING_CODE_LENGTH, '0');
        } while (this.pairingSessions.has(code));
        return code;
    }
    dispose() {
        clearInterval(this.cleanupTimer);
    }
}
exports.SessionStore = SessionStore;
//# sourceMappingURL=session-store.js.map