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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const relay_client_1 = require("./relay-client");
const task_monitor_1 = require("./monitors/task-monitor");
const terminal_monitor_1 = require("./monitors/terminal-monitor");
const chat_monitor_1 = require("./monitors/chat-monitor");
const pairing_1 = require("./pairing");
let relayClient;
let taskMonitor;
let terminalMonitor;
let chatMonitor;
let statusBarItem;
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Remote Task Monitor');
    context.subscriptions.push(outputChannel);
    // ── Status bar ──
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-task-monitor.pair';
    setStatusBar(false);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // ── Relay client ──
    relayClient = new relay_client_1.RelayClient(context, outputChannel);
    relayClient.onStatusChange((connected) => {
        setStatusBar(connected);
        if (connected) {
            // Send initial sync when connected
            taskMonitor.sendTaskList();
        }
    });
    // ── Monitors ──
    taskMonitor = new task_monitor_1.TaskMonitor(relayClient);
    terminalMonitor = new terminal_monitor_1.TerminalMonitor(relayClient);
    chatMonitor = new chat_monitor_1.ChatMonitor(relayClient);
    // Handle status:request from PWA
    relayClient.onMessage((msg) => {
        if (msg.type === 'status:request') {
            relayClient.send({
                type: 'status:sync',
                tasks: [], // taskMonitor will fill via sendTaskList
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
    const savedSessionId = context.globalState.get('sessionId');
    if (savedSessionId) {
        const relayUrl = getRelayUrl();
        relayClient.connect(relayUrl, savedSessionId);
    }
    // ── Commands ──
    context.subscriptions.push(vscode.commands.registerCommand('remote-task-monitor.pair', async () => {
        const relayUrl = getRelayUrl();
        const result = await (0, pairing_1.startPairing)(relayUrl);
        if (result) {
            // Save session and connect
            await context.globalState.update('sessionId', result.sessionId);
            relayClient.connect(relayUrl, result.sessionId);
            outputChannel.appendLine(`Paired with code ${result.code}, session ${result.sessionId}`);
        }
    }), vscode.commands.registerCommand('remote-task-monitor.disconnect', () => {
        relayClient.disconnect();
        setStatusBar(false);
        vscode.window.showInformationMessage('Remote Task Monitor disconnected.');
    }));
    context.subscriptions.push({
        dispose: () => {
            relayClient.dispose();
            taskMonitor.dispose();
            terminalMonitor.dispose();
            chatMonitor.dispose();
        },
    });
}
function deactivate() {
    relayClient?.dispose();
    taskMonitor?.dispose();
    terminalMonitor?.dispose();
    chatMonitor?.dispose();
}
function setStatusBar(connected) {
    if (connected) {
        statusBarItem.text = '$(remote) RTM: Connected';
        statusBarItem.tooltip = 'Remote Task Monitor — Connected to phone';
        statusBarItem.backgroundColor = undefined;
    }
    else {
        statusBarItem.text = '$(remote) RTM: Disconnected';
        statusBarItem.tooltip = 'Remote Task Monitor — Click to pair';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}
function getRelayUrl() {
    return vscode.workspace
        .getConfiguration('remoteTaskMonitor')
        .get('relayUrl', 'http://localhost:3200');
}
//# sourceMappingURL=extension.js.map