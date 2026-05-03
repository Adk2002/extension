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
exports.TaskMonitor = void 0;
const vscode = __importStar(require("vscode"));
class TaskMonitor {
    constructor(relay) {
        this.relay = relay;
        this.tasks = new Map();
        this.disposables = [];
        this.disposables.push(vscode.tasks.onDidStartTask((e) => this.onTaskStarted(e)), vscode.tasks.onDidEndTask((e) => this.onTaskEnded(e)), vscode.tasks.onDidEndTaskProcess((e) => this.onTaskProcessEnded(e)));
    }
    /** Send current task list to relay (for initial sync). */
    async sendTaskList() {
        const vscodeTasks = await vscode.tasks.fetchTasks();
        const taskList = vscodeTasks.map((t) => ({
            id: t.definition.type + ':' + t.name,
            name: t.name,
            source: t.source,
            type: t.definition.type,
            status: 'completed',
            startedAt: new Date().toISOString(),
        }));
        // Merge with actively tracked running tasks
        for (const tracked of this.tasks.values()) {
            const idx = taskList.findIndex((t) => t.id === tracked.id);
            if (idx >= 0) {
                taskList[idx] = tracked;
            }
            else {
                taskList.push(tracked);
            }
        }
        this.relay.send({
            type: 'status:sync',
            tasks: taskList,
            terminals: [], // terminal monitor fills this in
        });
    }
    onTaskStarted(e) {
        const task = e.execution.task;
        const id = task.definition.type + ':' + task.name + ':' + Date.now();
        const tracked = {
            id,
            name: task.name,
            source: task.source,
            type: task.definition.type,
            status: 'running',
            startedAt: new Date().toISOString(),
        };
        this.tasks.set(id, tracked);
        // Tag execution so we can find it in onTaskEnded
        e.execution.__remoteId = id;
        this.relay.send({
            type: 'task:started',
            id,
            name: tracked.name,
            source: tracked.source,
            taskType: tracked.type,
            startedAt: tracked.startedAt,
        });
    }
    onTaskEnded(e) {
        const id = e.execution.__remoteId;
        if (!id)
            return;
        const tracked = this.tasks.get(id);
        if (!tracked)
            return;
        if (tracked.status === 'running') {
            tracked.status = 'completed';
        }
        tracked.endedAt = new Date().toISOString();
        this.relay.send({
            type: 'task:ended',
            id,
            name: tracked.name,
            exitCode: tracked.exitCode ?? 0,
            endedAt: tracked.endedAt,
        });
    }
    onTaskProcessEnded(e) {
        const id = e.execution.__remoteId;
        if (!id)
            return;
        const tracked = this.tasks.get(id);
        if (!tracked)
            return;
        tracked.exitCode = e.exitCode;
        tracked.status = e.exitCode === 0 ? 'completed' : 'failed';
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.TaskMonitor = TaskMonitor;
//# sourceMappingURL=task-monitor.js.map