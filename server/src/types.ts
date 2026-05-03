// ── Shared message types for the relay protocol ──

export interface TaskInfo {
  id: string;
  name: string;
  source: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
}

export interface TerminalInfo {
  id: string;
  name: string;
  recentOutput: string;
}

// ── Messages: auth ──

export interface AuthMessage {
  type: 'auth';
  sessionId: string;
  role: 'extension' | 'pwa';
}

export interface AuthOkMessage {
  type: 'auth:ok';
}

export interface AuthErrorMessage {
  type: 'auth:error';
  message: string;
}

// ── Messages: extension → relay → PWA ──

export interface StatusSyncMessage {
  type: 'status:sync';
  tasks: TaskInfo[];
  terminals: TerminalInfo[];
}

export interface TaskStartedMessage {
  type: 'task:started';
  id: string;
  name: string;
  source: string;
  taskType: string;
  startedAt: string;
}

export interface TaskEndedMessage {
  type: 'task:ended';
  id: string;
  name: string;
  exitCode: number;
  endedAt: string;
}

export interface TerminalOutputMessage {
  type: 'terminal:output';
  terminalId: string;
  data: string;
}

export interface ChatMessage {
  type: 'chat:message';
  participant: string;
  prompt: string;
  response: string;
}

export interface PairStatusMessage {
  type: 'pair:connected' | 'pair:disconnected';
}

// ── Messages: PWA → relay → extension ──

export interface TerminalCommandMessage {
  type: 'terminal:command';
  terminalId?: string;
  command: string;
}

export interface TaskAssignMessage {
  type: 'task:assign';
  name: string;
  command: string;
  taskType: 'shell' | 'task' | 'notification';
}

export interface StatusRequestMessage {
  type: 'status:request';
}

// ── Union types ──

export type ServerToClientMessage =
  | AuthOkMessage
  | AuthErrorMessage
  | StatusSyncMessage
  | TaskStartedMessage
  | TaskEndedMessage
  | TerminalOutputMessage
  | ChatMessage
  | PairStatusMessage;

export type ClientToServerMessage =
  | AuthMessage
  | StatusSyncMessage
  | TaskStartedMessage
  | TaskEndedMessage
  | TerminalOutputMessage
  | ChatMessage
  | TerminalCommandMessage
  | TaskAssignMessage
  | StatusRequestMessage;

// ── Session types ──

export interface PairingSession {
  sessionId: string;
  code: string;
  createdAt: number;
  expiresAt: number;
}

export interface ActiveSession {
  sessionId: string;
  extensionSocket: import('ws').WebSocket | null;
  pwaSocket: import('ws').WebSocket | null;
}
