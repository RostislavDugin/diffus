import * as vscode from 'vscode';
import { TrackingSession } from './types';
import { isBinaryFile, shouldIgnorePath, batchCheckGitIgnored } from './fileUtils';
import { MAX_FILE_SIZE, SNAPSHOT_READ_CONCURRENCY } from './constants';
import { log } from './logger';

export async function readFilesParallel(
  filePaths: string[],
  snapshots: Map<string, string>,
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < filePaths.length) {
      const filePath = filePaths[index++];
      try {
        const fileUri = vscode.Uri.file(filePath);
        const content = await vscode.workspace.fs.readFile(fileUri);
        if (content.byteLength > MAX_FILE_SIZE) {
          continue;
        }
        snapshots.set(filePath, Buffer.from(content).toString('utf-8'));
      } catch {
        // File may have been deleted between listing and reading
      }
    }
  }

  const workerCount = Math.min(SNAPSHOT_READ_CONCURRENCY, filePaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

let sessionCounter = 0;

export class SnapshotManager {
  private sessions: Map<string, TrackingSession> = new Map();

  async startSession(): Promise<{ sessionId: string }> {
    const sessionId = `session-${++sessionCounter}-${Date.now()}`;
    const snapshots = new Map<string, string>();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return { sessionId };
    }

    for (const folder of workspaceFolders) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*'),
        '**/node_modules/**',
      );

      // Filter by binary and hardcoded patterns first
      const candidates = files
        .map((f) => f.fsPath)
        .filter((fp) => !isBinaryFile(fp) && !shouldIgnorePath(fp));

      log(`Snapshot: ${candidates.length} candidate files (${files.length} total found)`);

      // Batch check gitignore via git
      const ignored = await batchCheckGitIgnored(candidates, folder.uri.fsPath);

      const filesToRead = candidates.filter((fp) => !ignored.has(fp));
      const readStart = Date.now();
      await readFilesParallel(filesToRead, snapshots);
      log(`File reading: ${filesToRead.length} files in ${Date.now() - readStart}ms`);
    }

    const session: TrackingSession = { id: sessionId, snapshots };
    this.sessions.set(sessionId, session);
    log(`Snapshot complete: ${snapshots.size} files captured`);
    return { sessionId };
  }

  getSnapshot(sessionId: string, filePath: string): string | undefined {
    return this.sessions.get(sessionId)?.snapshots.get(filePath);
  }

  /** Returns snapshot content. Undefined means file didn't exist at snapshot time. */
  getSnapshotOrEmpty(sessionId: string, filePath: string): string {
    return this.getSnapshot(sessionId, filePath) ?? '';
  }

  updateSnapshot(sessionId: string, filePath: string, content: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.snapshots.set(filePath, content);
    }
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  fileExistedInSnapshot(sessionId: string, filePath: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.snapshots.has(filePath) ?? false;
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSessionData(sessionId: string): { id: string; snapshots: Map<string, string> } | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return { id: session.id, snapshots: session.snapshots };
  }

  restoreSession(sessionId: string, snapshots: Map<string, string>): void {
    this.sessions.set(sessionId, { id: sessionId, snapshots });
  }

  dispose(): void {
    this.sessions.clear();
  }
}
