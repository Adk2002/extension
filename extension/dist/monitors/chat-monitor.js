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
exports.ChatMonitor = void 0;
const vscode = __importStar(require("vscode"));
class ChatMonitor {
    constructor(relay) {
        this.relay = relay;
        this.disposables = [];
        this.taskQueue = [];
        // Register chat participant
        const participant = vscode.chat.createChatParticipant('remote-task-monitor.remote', this.handleChatRequest.bind(this));
        participant.iconPath = new vscode.ThemeIcon('remote');
        this.disposables.push(participant);
        // Listen for task assignments from PWA
        this.relay.onMessage((msg) => {
            if (msg.type === 'task:assign') {
                this.handleRemoteTaskAssign(msg);
            }
        });
    }
    async handleChatRequest(request, _context, stream, _token) {
        if (request.command === 'status') {
            const connected = this.relay.connected;
            stream.markdown(connected
                ? '✅ **Connected** to relay server. Phone is paired.'
                : '❌ **Disconnected**. Use the "Pair with Phone" command to connect.');
            return;
        }
        if (request.command === 'tasks') {
            if (this.taskQueue.length === 0) {
                stream.markdown('No pending remote tasks in the queue.');
                return;
            }
            stream.markdown('### Pending Remote Tasks\n');
            for (const [i, task] of this.taskQueue.entries()) {
                stream.markdown(`${i + 1}. **${task.name}** — \`${task.command}\` _(${task.taskType})_\n`);
            }
            return;
        }
        // Default: show help
        stream.markdown('### @remote — Remote Task Monitor\n\n' +
            'Use `/status` to check connection, or `/tasks` to see queued remote tasks.\n\n' +
            'Tasks assigned from your phone will appear here.');
    }
    async handleRemoteTaskAssign(msg) {
        const { name, command, taskType } = msg;
        if (taskType === 'shell') {
            // Execute as a shell task
            const task = new vscode.Task({ type: 'shell' }, vscode.TaskScope.Workspace, name || 'Remote Task', 'remote', new vscode.ShellExecution(command));
            await vscode.tasks.executeTask(task);
            vscode.window.showInformationMessage(`Remote task started: ${name}`);
        }
        else if (taskType === 'notification') {
            // Just show a notification and queue it
            this.taskQueue.push({ name, command, taskType });
            const action = await vscode.window.showInformationMessage(`📱 Remote task: ${name}\n${command}`, 'Run Now', 'Dismiss');
            if (action === 'Run Now') {
                const task = new vscode.Task({ type: 'shell' }, vscode.TaskScope.Workspace, name || 'Remote Task', 'remote', new vscode.ShellExecution(command));
                await vscode.tasks.executeTask(task);
            }
            // Remove from queue
            const idx = this.taskQueue.findIndex((t) => t.name === name && t.command === command);
            if (idx >= 0)
                this.taskQueue.splice(idx, 1);
        }
        else {
            // Default: execute as VS Code task
            const task = new vscode.Task({ type: 'shell' }, vscode.TaskScope.Workspace, name || 'Remote Task', 'remote', new vscode.ShellExecution(command));
            await vscode.tasks.executeTask(task);
        }
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.ChatMonitor = ChatMonitor;
//# sourceMappingURL=chat-monitor.js.map