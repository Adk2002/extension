import { v4 as uuidv4 } from 'uuid';
import { PairingSession, ActiveSession } from './types';

const PAIRING_CODE_LENGTH = 6;
const PAIRING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

export class SessionStore {
  private pairingSessions = new Map<string, PairingSession>(); // code → session
  private activeSessions = new Map<string, ActiveSession>();   // sessionId → session

  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
  }

  /** Generate a new pairing session. Returns the code + sessionId + expiresAt. */
  createPairing(): { code: string; sessionId: string; expiresAt: string } {
    const code = this.generateCode();
    const sessionId = uuidv4();
    const now = Date.now();
    const expiresAt = now + PAIRING_TTL_MS;

    const session: PairingSession = {
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
  joinByCode(code: string): string | null {
    const session = this.pairingSessions.get(code);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.pairingSessions.delete(code);
      return null;
    }

    // Code is consumed after successful join
    this.pairingSessions.delete(code);
    return session.sessionId;
  }

  /** Get an active session by sessionId. */
  getSession(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** Remove an active session. */
  removeSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  /** Clean up expired pairing sessions. */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [code, session] of this.pairingSessions) {
      if (now > session.expiresAt) {
        this.pairingSessions.delete(code);
      }
    }
  }

  /** Generate a random numeric code. */
  private generateCode(): string {
    let code: string;
    do {
      const array = new Uint32Array(1);
      // Use crypto for secure random
      require('crypto').getRandomValues(array);
      code = String(array[0] % 10 ** PAIRING_CODE_LENGTH).padStart(PAIRING_CODE_LENGTH, '0');
    } while (this.pairingSessions.has(code));
    return code;
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }
}
