"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const session_store_1 = require("./session-store");
const relay_1 = require("./relay");
const PORT = parseInt(process.env.PORT || '3200', 10);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') ?? ['*'];
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
}));
const sessionStore = new session_store_1.SessionStore();
// ── REST endpoints ──
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Rate limiting: simple in-memory counter per IP
const pairRateMap = new Map();
const PAIR_RATE_LIMIT = 10; // max requests
const PAIR_RATE_WINDOW = 60000; // per minute
app.post('/api/pair', (req, res) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = pairRateMap.get(ip);
    if (entry && now < entry.resetAt) {
        if (entry.count >= PAIR_RATE_LIMIT) {
            res.status(429).json({ error: 'Too many requests. Try again later.' });
            return;
        }
        entry.count++;
    }
    else {
        pairRateMap.set(ip, { count: 1, resetAt: now + PAIR_RATE_WINDOW });
    }
    const result = sessionStore.createPairing();
    res.json(result);
});
app.post('/api/pair/join', (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Missing or invalid code' });
        return;
    }
    const sessionId = sessionStore.joinByCode(code);
    if (!sessionId) {
        res.status(404).json({ error: 'Invalid or expired pairing code' });
        return;
    }
    res.json({ sessionId });
});
// ── HTTP + WebSocket server ──
const server = http_1.default.createServer(app);
const relay = new relay_1.Relay(server, sessionStore);
server.listen(PORT, () => {
    console.log(`Relay server listening on port ${PORT}`);
    console.log(`  REST:      http://localhost:${PORT}/api/health`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    relay.dispose();
    sessionStore.dispose();
    server.close();
});
//# sourceMappingURL=index.js.map