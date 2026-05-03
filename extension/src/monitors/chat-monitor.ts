import * as vscode from 'vscode';
import { RelayClient } from '../relay-client';

export class ChatMonitor {
  private disposables: vscode.Disposable[] = [];
  private taskQueue: Array<{ name: string; command: string; taskType: string }> = [];

  constructor(private relay: RelayClient) {
    // Register chat participant
    const participant = vscode.chat.createChatParticipant(
      'remote-task-monitor.remote',
      this.handleChatRequest.bind(this),
    );

    participant.iconPath = new vscode.ThemeIcon('remote');
    this.disposables.push(participant);

    // Listen for task assignments from PWA
    this.relay.onMessage((msg) => {
      if (msg.type === 'task:assign') {
        this.handleRemoteTaskAssign(msg);
      }
    });
  }

  private async handleChatRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    if (request.command === 'status') {
      const connected = this.relay.connected;
      stream.markdown(
        connected
          ? '✅ **Connected** to relay server. Phone is paired.'
          : '❌ **Disconnected**. Use the "Pair with Phone" command to connect.',
      );
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
    stream.markdown(
      '### @remote — Remote Task Monitor\n\n' +
      'Use `/status` to check connection, or `/tasks` to see queued remote tasks.\n\n' +
      'Tasks assigned from your phone will appear here.',
    );
  }

  private async handleRemoteTaskAssign(msg: {
    name: string;
    command: string;
    taskType: string;
  }): Promise<void> {
    const { name, command, taskType } = msg;

    if (taskType === 'shell') {
      // Execute as a shell task
      const task = new vscode.Task(
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        name || 'Remote Task',
        'remote',
        new vscode.ShellExecution(command),
      );
      await vscode.tasks.executeTask(task);
      vscode.window.showInformationMessage(`Remote task started: ${name}`);
    } else if (taskType === 'notification') {
      // Just show a notification and queue it
      this.taskQueue.push({ name, command, taskType });
      const action = await vscode.window.showInformationMessage(
        `📱 Remote task: ${name}\n${command}`,
        'Run Now',
        'Dismiss',
      );
      if (action === 'Run Now') {
        const task = new vscode.Task(
          { type: 'shell' },
          vscode.TaskScope.Workspace,
          name || 'Remote Task',
          'remote',
          new vscode.ShellExecution(command),
        );
        await vscode.tasks.executeTask(task);
      }
      // Remove from queue
      const idx = this.taskQueue.findIndex(
        (t) => t.name === name && t.command === command,
      );
      if (idx >= 0) this.taskQueue.splice(idx, 1);
    } else {
      // Default: execute as VS Code task
      const task = new vscode.Task(
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        name || 'Remote Task',
        'remote',
        new vscode.ShellExecution(command),
      );
      await vscode.tasks.executeTask(task);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
