import * as vscode from 'vscode';
import { DEBOUNCE_MS } from './constants';
import { Ignore } from 'ignore';
import { isBinaryFile, shouldIgnorePath, isFileTooLarge, isGitignored } from './fileUtils';
import { computeHunks } from './diffEngine';
import { SnapshotManager } from './snapshotManager';
import { HunkManager } from './hunkManager';

export class FileSystemWatcherManager {
  private watcher: vscode.FileSystemWatcher | undefined;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private disposables: vscode.Disposable[] = [];

  /** Set to true when the extension itself is making edits (to avoid recursion) */
  selfEditing = false;

  constructor(
    private snapshotManager: SnapshotManager,
    private hunkManager: HunkManager,
    private activeSessionId: string,
    private gitignoreFilters: Map<string, Ignore> = new Map(),
  ) {}

  start(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = vscode.workspace.createFileSystemWatcher('**/*');

    this.disposables.push(
      this.watcher.onDidChange((uri) => this.onFileEvent(uri)),
      this.watcher.onDidCreate((uri) => this.onFileEvent(uri)),
      this.watcher.onDidDelete((uri) => this.onFileDeleted(uri)),
    );
  }

  stop(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  updateSessionId(sessionId: string): void {
    this.activeSessionId = sessionId;
  }

  private isIgnored(filePath: string): boolean {
    if (isBinaryFile(filePath) || shouldIgnorePath(filePath)) {
      return true;
    }
    for (const [root, filter] of this.gitignoreFilters) {
      if (filePath.startsWith(root) && isGitignored(filter, root, filePath)) {
        return true;
      }
    }
    return false;
  }

  private onFileEvent(uri: vscode.Uri): void {
    if (this.selfEditing) {
      return;
    }

    const filePath = uri.fsPath;
    if (this.isIgnored(filePath)) {
      return;
    }

    // Debounce per file
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.processFileChange(uri);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  private async processFileChange(uri: vscode.Uri): Promise<void> {
    const filePath = uri.fsPath;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (isFileTooLarge(stat.size)) {
        return;
      }
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const currentContent = Buffer.from(contentBytes).toString('utf-8');
      const snapshotContent = this.snapshotManager.getSnapshotOrEmpty(
        this.activeSessionId,
        filePath,
      );

      const hunks = computeHunks(snapshotContent, currentContent, this.activeSessionId, filePath);
      this.hunkManager.setHunksForFile(filePath, this.activeSessionId, hunks);
    } catch {
      // File might have been deleted between event and processing
    }
  }

  private onFileDeleted(uri: vscode.Uri): void {
    if (this.selfEditing) {
      return;
    }

    const filePath = uri.fsPath;
    if (this.isIgnored(filePath)) {
      return;
    }

    // File was deleted — clear any tracked changes for it
    this.hunkManager.removeAllHunksForFile(filePath);
  }

  dispose(): void {
    this.stop();
  }
}
