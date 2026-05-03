import * as vscode from 'vscode';
import { RelayClient } from '../relay-client';

interface TrackedTask {
  id: string;
  name: string;
  source: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
}

export class TaskMonitor {
  private tasks = new Map<string, TrackedTask>();
  private disposables: vscode.Disposable[] = [];

  constructor(private relay: RelayClient) {
    this.disposables.push(
      vscode.tasks.onDidStartTask((e) => this.onTaskStarted(e)),
      vscode.tasks.onDidEndTask((e) => this.onTaskEnded(e)),
      vscode.tasks.onDidEndTaskProcess((e) => this.onTaskProcessEnded(e)),
    );
  }

  /** Send current task list to relay (for initial sync). */
  async sendTaskList(): Promise<void> {
    const vscodeTasks = await vscode.tasks.fetchTasks();
    const taskList: TrackedTask[] = vscodeTasks.map((t) => ({
      id: t.definition.type + ':' + t.name,
      name: t.name,
      source: t.source,
      type: t.definition.type,
      status: 'completed' as const,
      startedAt: new Date().toISOString(),
    }));

    // Merge with actively tracked running tasks
    for (const tracked of this.tasks.values()) {
      const idx = taskList.findIndex((t) => t.id === tracked.id);
      if (idx >= 0) {
        taskList[idx] = tracked;
      } else {
        taskList.push(tracked);
      }
    }

    this.relay.send({
      type: 'status:sync',
      tasks: taskList,
      terminals: [], // terminal monitor fills this in
    });
  }

  private onTaskStarted(e: vscode.TaskStartEvent): void {
    const task = e.execution.task;
    const id = task.definition.type + ':' + task.name + ':' + Date.now();
    const tracked: TrackedTask = {
      id,
      name: task.name,
      source: task.source,
      type: task.definition.type,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    this.tasks.set(id, tracked);

    // Tag execution so we can find it in onTaskEnded
    (e.execution as any).__remoteId = id;

    this.relay.send({
      type: 'task:started',
      id,
      name: tracked.name,
      source: tracked.source,
      taskType: tracked.type,
      startedAt: tracked.startedAt,
    });
  }

  private onTaskEnded(e: vscode.TaskEndEvent): void {
    const id: string | undefined = (e.execution as any).__remoteId;
    if (!id) return;

    const tracked = this.tasks.get(id);
    if (!tracked) return;

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

  private onTaskProcessEnded(e: vscode.TaskProcessEndEvent): void {
    const id: string | undefined = (e.execution as any).__remoteId;
    if (!id) return;

    const tracked = this.tasks.get(id);
    if (!tracked) return;

    tracked.exitCode = e.exitCode;
    tracked.status = e.exitCode === 0 ? 'completed' : 'failed';
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
