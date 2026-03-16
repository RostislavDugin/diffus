import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { TrackingState } from './types';
import { logError } from './logger';

interface PersistedState {
  sessionId: string;
  trackingState: TrackingState;
  files: Record<string, string>; // filePath -> pathHash
  timestamp: number;
}

export class StorageManager {
  private storageDir: string;
  private snapshotsDir: string;
  private stateFile: string;

  constructor() {
    const workspaceId = this.getWorkspaceId();
    this.storageDir = path.join(os.tmpdir(), 'diffus', workspaceId);
    this.snapshotsDir = path.join(this.storageDir, 'snapshots');
    this.stateFile = path.join(this.storageDir, 'state.json');
  }

  private getWorkspaceId(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return 'no-workspace';
    }
    return crypto.createHash('sha256').update(folders[0].uri.fsPath).digest('hex').substring(0, 16);
  }

  private hashFilePath(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 32);
  }

  saveSessionSync(
    sessionId: string,
    trackingState: TrackingState,
    snapshots: Map<string, string>,
  ): void {
    try {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });

      const files: Record<string, string> = {};
      for (const [filePath, content] of snapshots) {
        const hash = this.hashFilePath(filePath);
        files[filePath] = hash;
        fs.writeFileSync(path.join(this.snapshotsDir, `${hash}.snap`), content, 'utf-8');
      }

      const state: PersistedState = {
        sessionId,
        trackingState,
        files,
        timestamp: Date.now(),
      };

      const tmpFile = this.stateFile + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(state), 'utf-8');
      fs.renameSync(tmpFile, this.stateFile);
    } catch (err) {
      logError('Failed to persist state', err);
    }
  }

  async loadState(): Promise<{
    sessionId: string;
    trackingState: TrackingState;
    snapshots: Map<string, string>;
  } | null> {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return null;
      }

      const raw = fs.readFileSync(this.stateFile, 'utf-8');
      const persisted: PersistedState = JSON.parse(raw);

      if (!persisted.sessionId || !persisted.files) {
        return null;
      }

      const snapshots = new Map<string, string>();
      for (const [filePath, hash] of Object.entries(persisted.files)) {
        const snapFile = path.join(this.snapshotsDir, `${hash}.snap`);
        try {
          const content = fs.readFileSync(snapFile, 'utf-8');
          snapshots.set(filePath, content);
        } catch {
          // Snapshot file missing — skip this file
        }
      }

      return {
        sessionId: persisted.sessionId,
        trackingState: persisted.trackingState,
        snapshots,
      };
    } catch (err) {
      logError('Failed to load persisted state', err);
      return null;
    }
  }

  clearSync(): void {
    try {
      if (fs.existsSync(this.storageDir)) {
        fs.rmSync(this.storageDir, { recursive: true, force: true });
      }
    } catch (err) {
      logError('Failed to clear persisted state', err);
    }
  }

  hasPersistedState(): boolean {
    return fs.existsSync(this.stateFile);
  }
}
