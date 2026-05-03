import * as vscode from 'vscode';
import { RelayClient } from './relay-client';
import { TaskMonitor } from './monitors/task-monitor';
import { TerminalMonitor } from './monitors/terminal-monitor';
import { ChatMonitor } from './monitors/chat-monitor';
import { startPairing } from './pairing';

let relayClient: RelayClient;
let taskMonitor: TaskMonitor;
let terminalMonitor: TerminalMonitor;
let chatMonitor: ChatMonitor;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Remote Task Monitor');
  context.subscriptions.push(outputChannel);

  // ── Status bar ──
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'remote-task-monitor.pair';
  setStatusBar(false);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Relay client ──
  relayClient = new RelayClient(context, outputChannel);
  relayClient.onStatusChange((connected) => {
    setStatusBar(connected);
    if (connected) {
      // Send initial sync when connected
      taskMonitor.sendTaskList();
    }
  });

  // ── Monitors ──
  taskMonitor = new TaskMonitor(relayClient);
  terminalMonitor = new TerminalMonitor(relayClient);
  chatMonitor = new ChatMonitor(relayClient);

  // Handle status:request from PWA
  relayClient.onMessage((msg) => {
    if (msg.type === 'status:request') {
      relayClient.send({
        type: 'status:sync',
        tasks: [],      // taskMonitor will fill via sendTaskList
        terminals: terminalMonitor.getTerminalInfos(),
      });
      taskMonitor.sendTaskList();
    }
    if (msg.type === 'pair:connected') {
      vscode.window.showInformationMessage('📱 Phone connected!');
    }
    if (msg.type === 'pair:disconnected') {
      vscode.window.showInformationMessage('📱 Phone disconnected.');
    }
  });

  // ── Auto-reconnect on saved session ──
  const savedSessionId = context.globalState.get<string>('sessionId');
  if (savedSessionId) {
    const relayUrl = getRelayUrl();
    relayClient.connect(relayUrl, savedSessionId);
  }

  // ── Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('remote-task-monitor.pair', async () => {
      const relayUrl = getRelayUrl();
      const result = await startPairing(relayUrl);
      if (result) {
        // Save session and connect
        await context.globalState.update('sessionId', result.sessionId);
        relayClient.connect(relayUrl, result.sessionId);
        outputChannel.appendLine(`Paired with code ${result.code}, session ${result.sessionId}`);
      }
    }),

    vscode.commands.registerCommand('remote-task-monitor.disconnect', () => {
      relayClient.disconnect();
      setStatusBar(false);
      vscode.window.showInformationMessage('Remote Task Monitor disconnected.');
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      relayClient.dispose();
      taskMonitor.dispose();
      terminalMonitor.dispose();
      chatMonitor.dispose();
    },
  });
}

export function deactivate(): void {
  relayClient?.dispose();
  taskMonitor?.dispose();
  terminalMonitor?.dispose();
  chatMonitor?.dispose();
}

function setStatusBar(connected: boolean): void {
  if (connected) {
    statusBarItem.text = '$(remote) RTM: Connected';
    statusBarItem.tooltip = 'Remote Task Monitor — Connected to phone';
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(remote) RTM: Disconnected';
    statusBarItem.tooltip = 'Remote Task Monitor — Click to pair';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground',
    );
  }
}

function getRelayUrl(): string {
  return vscode.workspace
    .getConfiguration('remoteTaskMonitor')
    .get<string>('relayUrl', 'http://localhost:3200');
}
