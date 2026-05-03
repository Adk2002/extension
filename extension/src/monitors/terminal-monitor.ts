import * as vscode from 'vscode';
import { RelayClient } from '../relay-client';

const MAX_OUTPUT_LINES = 100;
const THROTTLE_MS = 500;

interface TrackedTerminal {
  id: string;
  name: string;
  outputLines: string[];
  throttleTimer?: ReturnType<typeof setTimeout>;
  pendingData: string;
}

export class TerminalMonitor {
  private terminals = new Map<string, TrackedTerminal>();
  private disposables: vscode.Disposable[] = [];
  private terminalCounter = 0;

  constructor(private relay: RelayClient) {
    // Listen for incoming commands from PWA
    this.relay.onMessage((msg) => {
      if (msg.type === 'terminal:command') {
        this.executeRemoteCommand(msg.command, msg.terminalId);
      }
    });

    // Track newly created terminals
    this.disposables.push(
      vscode.window.onDidOpenTerminal((t) => this.trackTerminal(t)),
      vscode.window.onDidCloseTerminal((t) => this.untrackTerminal(t)),
    );

    // Track existing terminals
    for (const t of vscode.window.terminals) {
      this.trackTerminal(t);
    }

    // Shell integration: capture command output when available
    if (vscode.window.onDidEndTerminalShellExecution) {
      this.disposables.push(
        vscode.window.onDidEndTerminalShellExecution(async (e) => {
          const id = this.getTerminalId(e.terminal);
          if (!id) return;
          const tracked = this.terminals.get(id);
          if (!tracked) return;

          // Read output from shell execution stream
          try {
            const stream = e.execution.read();
            for await (const data of stream) {
              this.appendOutput(tracked, data);
            }
          } catch {
            // Shell integration output may not be available
          }
        }),
      );
    }
  }

  /** Get terminal summaries for status sync. */
  getTerminalInfos(): Array<{ id: string; name: string; recentOutput: string }> {
    return Array.from(this.terminals.values()).map((t) => ({
      id: t.id,
      name: t.name,
      recentOutput: t.outputLines.slice(-MAX_OUTPUT_LINES).join('\n'),
    }));
  }

  /** Create a new monitored terminal with a custom PTY to capture output. */
  createMonitoredTerminal(name: string): vscode.Terminal {
    const id = `term-${++this.terminalCounter}`;
    const tracked: TrackedTerminal = {
      id,
      name,
      outputLines: [],
      pendingData: '',
    };

    const writeEmitter = new vscode.EventEmitter<string>();

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => {
        writeEmitter.fire(`[Remote Task Monitor] Terminal "${name}" ready.\r\n`);
      },
      close: () => {
        this.terminals.delete(id);
      },
      handleInput: (data: string) => {
        // Echo input and capture
        writeEmitter.fire(data);
        this.appendOutput(tracked, data);
      },
    };

    const terminal = vscode.window.createTerminal({ name, pty });
    this.terminals.set(id, tracked);
    return terminal;
  }

  private trackTerminal(terminal: vscode.Terminal): void {
    const id = `term-${++this.terminalCounter}`;
    (terminal as any).__remoteId = id;

    this.terminals.set(id, {
      id,
      name: terminal.name,
      outputLines: [],
      pendingData: '',
    });
  }

  private untrackTerminal(terminal: vscode.Terminal): void {
    const id = this.getTerminalId(terminal);
    if (id) {
      this.terminals.delete(id);
    }
  }

  private getTerminalId(terminal: vscode.Terminal): string | undefined {
    return (terminal as any).__remoteId;
  }

  private executeRemoteCommand(command: string, terminalId?: string): void {
    let target: vscode.Terminal | undefined;

    if (terminalId) {
      // Find specific terminal
      target = vscode.window.terminals.find(
        (t) => (t as any).__remoteId === terminalId,
      );
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

  private appendOutput(tracked: TrackedTerminal, data: string): void {
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

  dispose(): void {
    for (const t of this.terminals.values()) {
      if (t.throttleTimer) clearTimeout(t.throttleTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
