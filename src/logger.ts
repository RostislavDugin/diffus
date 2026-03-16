import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLogger(): void {
  channel = vscode.window.createOutputChannel('Diffus');
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export function log(message: string): void {
  channel?.appendLine(`[${timestamp()}] ${message}`);
}

export function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  channel?.appendLine(`[${timestamp()}] ERROR: ${message}${detail ? ' — ' + detail : ''}`);
}
