"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalMonitor = void 0;
const vscode = __importStar(require("vscode"));
const MAX_OUTPUT_LINES = 100;
const THROTTLE_MS = 500;
class TerminalMonitor {
    constructor(relay) {
        this.relay = relay;
        this.terminals = new Map();
        this.disposables = [];
        this.terminalCounter = 0;
        // Listen for incoming commands from PWA
        this.relay.onMessage((msg) => {
            if (msg.type === 'terminal:command') {
                this.executeRemoteCommand(msg.command, msg.terminalId);
            }
        });
        // Track newly created terminals
        this.disposables.push(vscode.window.onDidOpenTerminal((t) => this.trackTerminal(t)), vscode.window.onDidCloseTerminal((t) => this.untrackTerminal(t)));
        // Track existing terminals
        for (const t of vscode.window.terminals) {
            this.trackTerminal(t);
        }
        // Shell integration: capture command output when available
        if (vscode.window.onDidEndTerminalShellExecution) {
            this.disposables.push(vscode.window.onDidEndTerminalShellExecution(async (e) => {
                const id = this.getTerminalId(e.terminal);
                if (!id)
                    return;
                const tracked = this.terminals.get(id);
                if (!tracked)
                    return;
                // Read output from shell execution stream
                try {
                    const stream = e.shellExecution.read();
                    for await (const data of stream) {
                        this.appendOutput(tracked, data);
                    }
                }
                catch {
                    // Shell integration output may not be available
                }
            }));
        }
    }
    /** Get terminal summaries for status sync. */
    getTerminalInfos() {
        return Array.from(this.terminals.values()).map((t) => ({
            id: t.id,
            name: t.name,
            recentOutput: t.outputLines.slice(-MAX_OUTPUT_LINES).join('\n'),
        }));
    }
    /** Create a new monitored terminal with a custom PTY to capture output. */
    createMonitoredTerminal(name) {
        const id = `term-${++this.terminalCounter}`;
        const tracked = {
            id,
            name,
            outputLines: [],
            pendingData: '',
        };
        const writeEmitter = new vscode.EventEmitter();
        const pty = {
            onDidWrite: writeEmitter.event,
            open: () => {
                writeEmitter.fire(`[Remote Task Monitor] Terminal "${name}" ready.\r\n`);
            },
            close: () => {
                this.terminals.delete(id);
            },
            handleInput: (data) => {
                // Echo input and capture
                writeEmitter.fire(data);
                this.appendOutput(tracked, data);
            },
        };
        const terminal = vscode.window.createTerminal({ name, pty });
        this.terminals.set(id, tracked);
        return terminal;
    }
    trackTerminal(terminal) {
        const id = `term-${++this.terminalCounter}`;
        terminal.__remoteId = id;
        this.terminals.set(id, {
            id,
            name: terminal.name,
            outputLines: [],
            pendingData: '',
        });
    }
    untrackTerminal(terminal) {
        const id = this.getTerminalId(terminal);
        if (id) {
            this.terminals.delete(id);
        }
    }
    getTerminalId(terminal) {
        return terminal.__remoteId;
    }
    executeRemoteCommand(command, terminalId) {
        let target;
        if (terminalId) {
            // Find specific terminal
            target = vscode.window.terminals.find((t) => t.__remoteId === terminalId);
        }
        if (!target) {
            // Use active terminal or create one
            target = vscode.window.activeTerminal;
        }
        if (!target) {
            target = vscode.window.createTerminal('Remote');
            this.trackTerminal(target);
        }
        target.show(true);
        target.sendText(command);
        const id = this.getTerminalId(target) ?? 'unknown';
        this.relay.send({
            type: 'terminal:output',
            terminalId: id,
            data: `> ${command}\n`,
        });
    }
    appendOutput(tracked, data) {
        tracked.pendingData += data;
        // Throttle sending to relay
        if (!tracked.throttleTimer) {
            tracked.throttleTimer = setTimeout(() => {
                tracked.throttleTimer = undefined;
                const lines = tracked.pendingData.split(/\r?\n/);
                tracked.outputLines.push(...lines);
                // Keep only last N lines
                if (tracked.outputLines.length > MAX_OUTPUT_LINES) {
                    tracked.outputLines = tracked.outputLines.slice(-MAX_OUTPUT_LINES);
                }
                this.relay.send({
                    type: 'terminal:output',
                    terminalId: tracked.id,
                    data: tracked.pendingData,
                });
                tracked.pendingData = '';
            }, THROTTLE_MS);
        }
    }
    dispose() {
        for (const t of this.terminals.values()) {
            if (t.throttleTimer)
                clearTimeout(t.throttleTimer);
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.TerminalMonitor = TerminalMonitor;
//# sourceMappingURL=terminal-monitor.js.map