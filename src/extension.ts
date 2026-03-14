import * as vscode from 'vscode';
import { TrackingState } from './types';
import { SnapshotManager } from './snapshotManager';
import { HunkManager } from './hunkManager';
import { FileSystemWatcherManager } from './fileSystemWatcher';
import { DecorationManager } from './decorationManager';
import { DiffusCodeLensProvider } from './codeLensProvider';
import { NavigationManager } from './navigationManager';
import { StatusBarManager } from './statusBarManager';
import { StorageManager } from './storageManager';
import { DiffusHoverProvider } from './hoverProvider';
import { SnapshotContentProvider, SNAPSHOT_SCHEME } from './snapshotContentProvider';
import { DiffViewManager } from './diffViewManager';
import { computeHunks } from './diffEngine';
import { computeDecorationRanges } from './rangeCalculator';
import { Ignore } from 'ignore';
import { loadGitignoreFilter } from './fileUtils';
import { copyPathForClaude } from './copyPathCommand';

let state = TrackingState.Idle;
let activeSessionId: string | undefined;
let isProcessingHunk = false;

let snapshotManager: SnapshotManager;
let hunkManager: HunkManager;
let watcherManager: FileSystemWatcherManager | undefined;
let decorationManager: DecorationManager;
let codeLensProvider: DiffusCodeLensProvider;
let navigationManager: NavigationManager;
let statusBarManager: StatusBarManager;
let storageManager: StorageManager;
let snapshotContentProvider: SnapshotContentProvider;
let diffViewManager: DiffViewManager;

export function activate(context: vscode.ExtensionContext): void {
  storageManager = new StorageManager();
  snapshotManager = new SnapshotManager();
  hunkManager = new HunkManager();
  decorationManager = new DecorationManager();
  navigationManager = new NavigationManager(hunkManager);
  statusBarManager = new StatusBarManager();
  snapshotContentProvider = new SnapshotContentProvider(snapshotManager);
  diffViewManager = new DiffViewManager();

  codeLensProvider = new DiffusCodeLensProvider(hunkManager);

  // Register snapshot content provider for diff view
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SNAPSHOT_SCHEME, snapshotContentProvider),
  );

  // Register CodeLens provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
  );

  // Register hover provider
  const hoverProvider = new DiffusHoverProvider(hunkManager);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('diffus.startTracking', startTracking),
    vscode.commands.registerCommand('diffus.stopTracking', stopTracking),
    vscode.commands.registerCommand('diffus.toggleTracking', toggleTracking),
    vscode.commands.registerCommand('diffus.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('diffus.prevFile', () => navigationManager.prevFile()),
    vscode.commands.registerCommand('diffus.acceptHunk', acceptHunk),
    vscode.commands.registerCommand('diffus.rejectHunk', rejectHunk),
    vscode.commands.registerCommand('diffus.acceptAllFile', acceptAllFile),
    vscode.commands.registerCommand('diffus.rejectAllFile', rejectAllFile),
    vscode.commands.registerCommand('diffus.clearState', clearState),
    vscode.commands.registerCommand('diffus.showDiff', showDiff),
    vscode.commands.registerCommand('diffus.showChangedFiles', showChangedFiles),
    vscode.commands.registerCommand('diffus.copyPathForClaude', copyPathForClaude),
  );

  // Apply decorations when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        navigationManager.syncToActiveEditor(editor);
        applyDecorationsToEditor(editor);
      }
      updateContextKeys();
      statusBarManager.update(state, hunkManager.getChangedFileCount());
    }),
  );

  // Track hunk changes for UI updates
  context.subscriptions.push(
    hunkManager.onDidChange((changedFilePath) => {
      updateContextKeys();
      statusBarManager.update(state, hunkManager.getChangedFileCount());
      const editor = vscode.window.activeTextEditor;
      if (!isProcessingHunk && editor && editor.document.uri.fsPath === changedFilePath) {
        applyDecorationsToEditor(editor);
      }
    }),
  );

  // Initial state
  updateContextKeys();
  statusBarManager.update(state, 0);

  restorePersistedState();

  context.subscriptions.push(
    snapshotManager,
    hunkManager,
    decorationManager,
    codeLensProvider,
    statusBarManager,
    snapshotContentProvider,
    diffViewManager,
  );
}

async function restorePersistedState(): Promise<void> {
  try {
    const persisted = await storageManager.loadState();
    if (!persisted) {
      return;
    }

    snapshotManager.restoreSession(persisted.sessionId, persisted.snapshots);
    activeSessionId = persisted.sessionId;

    for (const [filePath, snapshotContent] of persisted.snapshots) {
      try {
        const uri = vscode.Uri.file(filePath);
        const currentBytes = await vscode.workspace.fs.readFile(uri);
        const currentContent = Buffer.from(currentBytes).toString('utf-8');
        if (snapshotContent === currentContent) {
          continue;
        }
        const hunks = computeHunks(snapshotContent, currentContent, persisted.sessionId, filePath);
        if (hunks.length > 0) {
          hunkManager.setHunksForFile(filePath, persisted.sessionId, hunks);
        }
      } catch {
        // File was deleted — don't track it
      }
    }

    if (persisted.trackingState === TrackingState.Tracking) {
      const gitignoreFilters = new Map<string, Ignore>();
      const folders = vscode.workspace.workspaceFolders ?? [];
      for (const folder of folders) {
        gitignoreFilters.set(folder.uri.fsPath, await loadGitignoreFilter(folder));
      }
      watcherManager = new FileSystemWatcherManager(
        snapshotManager,
        hunkManager,
        persisted.sessionId,
        gitignoreFilters,
      );
      watcherManager.start();
      state = TrackingState.Tracking;
    } else if (hunkManager.hasChanges()) {
      state = TrackingState.StoppedWithPending;
    }

    updateContextKeys();
    statusBarManager.update(state, hunkManager.getChangedFileCount());

    const editor = vscode.window.activeTextEditor;
    if (editor && hunkManager.fileHasChanges(editor.document.uri.fsPath)) {
      applyDecorationsToEditor(editor);
    }
  } catch (err) {
    console.error('Diffus: failed to restore persisted state', err);
  }
}

async function startTracking(): Promise<void> {
  const { sessionId, gitignoreFilters } = await snapshotManager.startSession();
  activeSessionId = sessionId;

  watcherManager?.stop();
  watcherManager = new FileSystemWatcherManager(
    snapshotManager,
    hunkManager,
    sessionId,
    gitignoreFilters,
  );
  watcherManager.start();

  state = TrackingState.Tracking;
  updateContextKeys();
  statusBarManager.update(state, hunkManager.getChangedFileCount());
}

function stopTracking(): void {
  if (state !== TrackingState.Tracking) {
    return;
  }

  watcherManager?.stop();

  state = hunkManager.hasChanges() ? TrackingState.StoppedWithPending : TrackingState.Idle;

  updateContextKeys();
  statusBarManager.update(state, hunkManager.getChangedFileCount());
}

function toggleTracking(): void {
  if (state === TrackingState.Tracking) {
    stopTracking();
  } else {
    startTracking();
  }
}

async function showChangedFiles(): Promise<void> {
  const changedFiles = hunkManager.getChangedFiles();
  if (changedFiles.length === 0) {
    return;
  }

  const items = changedFiles.map((filePath) => ({
    label: vscode.workspace.asRelativePath(filePath),
    filePath,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a changed file to open',
  });

  if (selected) {
    const doc = await vscode.workspace.openTextDocument(selected.filePath);
    await vscode.window.showTextDocument(doc);
  }
}

async function showDiff(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !activeSessionId) {
    return;
  }

  const filePath = editor.document.uri.fsPath;
  if (!hunkManager.fileHasChanges(filePath)) {
    return;
  }

  await diffViewManager.openDiff(filePath, activeSessionId);
}

async function acceptHunk(hunkId?: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!hunkId) {
    if (!editor) {
      return;
    }
    const filePath = editor.document.uri.fsPath;
    const cursorLine = editor.selection.active.line + 1;
    const hunk = hunkManager.getHunkAtLine(filePath, cursorLine);
    if (!hunk) {
      return;
    }
    hunkId = hunk.id;
  }

  const result = hunkManager.getHunkById(hunkId);
  if (!result) {
    return;
  }

  const { hunk, filePath } = result;

  isProcessingHunk = true;
  try {
    if (editor && editor.document.uri.fsPath === filePath) {
      const currentContent = editor.document.getText();
      snapshotManager.updateSnapshot(hunk.sessionId, filePath, currentContent);
    } else {
      try {
        const uri = vscode.Uri.file(filePath);
        const contentBytes = await vscode.workspace.fs.readFile(uri);
        const currentContent = Buffer.from(contentBytes).toString('utf-8');
        snapshotManager.updateSnapshot(hunk.sessionId, filePath, currentContent);
      } catch {
        /* ignore */
      }
    }

    hunkManager.removeHunk(hunkId);
    snapshotContentProvider.fireDidChange(filePath, hunk.sessionId);
  } finally {
    isProcessingHunk = false;
  }

  reapplyDecorations(filePath);
  checkAllResolved(filePath);
}

async function rejectHunk(hunkId?: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!hunkId) {
    if (!editor) {
      return;
    }
    const filePath = editor.document.uri.fsPath;
    const cursorLine = editor.selection.active.line + 1;
    const hunk = hunkManager.getHunkAtLine(filePath, cursorLine);
    if (!hunk) {
      return;
    }
    hunkId = hunk.id;
  }

  const result = hunkManager.getHunkById(hunkId);
  if (!result) {
    return;
  }

  const { hunk, filePath } = result;

  const setSelfEditing = (value: boolean) => {
    if (watcherManager) {
      watcherManager.selfEditing = value;
    }
  };

  isProcessingHunk = true;
  setSelfEditing(true);
  try {
    if (editor && editor.document.uri.fsPath === filePath) {
      const currentContent = editor.document.getText();
      const currentLines = currentContent.split('\n');

      const startIdx = hunk.newStart - 1;
      const deleteCount = hunk.newLines.length;
      currentLines.splice(startIdx, deleteCount, ...hunk.oldLines);

      const restoredContent = currentLines.join('\n');

      const fullRange = new vscode.Range(
        0,
        0,
        editor.document.lineCount - 1,
        editor.document.lineAt(editor.document.lineCount - 1).text.length,
      );

      await editor.edit(
        (editBuilder) => {
          editBuilder.replace(fullRange, restoredContent);
        },
        { undoStopBefore: true, undoStopAfter: true },
      );

      await editor.document.save();

      snapshotManager.updateSnapshot(hunk.sessionId, filePath, restoredContent);

      const lineDelta = hunk.oldLines.length - hunk.newLines.length;
      if (lineDelta !== 0) {
        const remainingHunks = hunkManager.getAllHunksForFile(filePath);
        for (const remaining of remainingHunks) {
          if (remaining.newStart > hunk.newStart) {
            remaining.newStart += lineDelta;
          }
        }
      }

      hunkManager.removeHunk(hunkId!);
    } else {
      const snapshotContent = snapshotManager.getSnapshotOrEmpty(hunk.sessionId, filePath);
      try {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(snapshotContent, 'utf-8'));
      } catch {
        /* ignore */
      }
      hunkManager.removeHunk(hunkId);
    }

    snapshotContentProvider.fireDidChange(filePath, hunk.sessionId);
  } finally {
    isProcessingHunk = false;
    setSelfEditing(false);
  }

  reapplyDecorations(filePath);
  checkAllResolved(filePath);
}

async function acceptAllFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const hunks = hunkManager.getAllHunksForFile(filePath);
  if (hunks.length === 0) {
    return;
  }

  isProcessingHunk = true;
  try {
    const currentContent = editor.document.getText();
    for (const hunk of hunks) {
      snapshotManager.updateSnapshot(hunk.sessionId, filePath, currentContent);
    }
    hunkManager.removeAllHunksForFile(filePath);
    decorationManager.clearDecorations(editor);

    if (activeSessionId) {
      snapshotContentProvider.fireDidChange(filePath, activeSessionId);
    }
  } finally {
    isProcessingHunk = false;
  }

  checkAllResolved(filePath);
}

async function rejectAllFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const hunks = hunkManager.getAllHunksForFile(filePath);
  if (hunks.length === 0) {
    return;
  }

  const setSelfEditing = (value: boolean) => {
    if (watcherManager) {
      watcherManager.selfEditing = value;
    }
  };

  isProcessingHunk = true;
  setSelfEditing(true);
  try {
    const sessionId = hunks[0].sessionId;
    const snapshotContent = snapshotManager.getSnapshotOrEmpty(sessionId, filePath);

    const fullRange = new vscode.Range(
      0,
      0,
      editor.document.lineCount - 1,
      editor.document.lineAt(editor.document.lineCount - 1).text.length,
    );

    await editor.edit(
      (editBuilder) => {
        editBuilder.replace(fullRange, snapshotContent);
      },
      { undoStopBefore: true, undoStopAfter: true },
    );

    await editor.document.save();

    hunkManager.removeAllHunksForFile(filePath);
    decorationManager.clearDecorations(editor);

    snapshotContentProvider.fireDidChange(filePath, sessionId);
  } finally {
    isProcessingHunk = false;
    setSelfEditing(false);
  }

  checkAllResolved(filePath);
}

function applyDecorationsToEditor(editor: vscode.TextEditor): void {
  const filePath = editor.document.uri.fsPath;
  const hunks = hunkManager.getAllHunksForFile(filePath);

  if (hunks.length === 0) {
    decorationManager.clearDecorations(editor);
    return;
  }

  const { addedRanges, deletionMarkers } = computeDecorationRanges(hunks);
  decorationManager.applyDecorations(editor, addedRanges, deletionMarkers);
}

function reapplyDecorations(filePath: string): void {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.fsPath === filePath) {
    applyDecorationsToEditor(editor);
  }
  codeLensProvider.refresh();
}

function updateContextKeys(): void {
  vscode.commands.executeCommand(
    'setContext',
    'diffus.isTracking',
    state === TrackingState.Tracking,
  );
  vscode.commands.executeCommand('setContext', 'diffus.hasChanges', hunkManager.hasChanges());
  const changedFileCount = hunkManager.getChangedFileCount();
  const editor = vscode.window.activeTextEditor;
  const activeFileHasChanges = editor
    ? hunkManager.fileHasChanges(editor.document.uri.fsPath)
    : false;

  // Show nav when multiple files changed, OR single file changed but user is in a different file
  const showNav = changedFileCount > 1 || (changedFileCount === 1 && !activeFileHasChanges);

  vscode.commands.executeCommand('setContext', 'diffus.multipleFilesChanged', showNav);

  if (editor) {
    vscode.commands.executeCommand('setContext', 'diffus.fileHasChanges', activeFileHasChanges);
  }
}

async function clearState(): Promise<void> {
  watcherManager?.stop();

  for (const editor of vscode.window.visibleTextEditors) {
    decorationManager.clearDecorations(editor);
  }

  await diffViewManager.closeAllDiffs();

  for (const filePath of hunkManager.getChangedFiles()) {
    hunkManager.removeAllHunksForFile(filePath);
  }

  if (activeSessionId) {
    snapshotManager.removeSession(activeSessionId);
    activeSessionId = undefined;
  }

  storageManager.clearSync();

  state = TrackingState.Idle;
  updateContextKeys();
  statusBarManager.update(state, 0);
}

async function checkAllResolved(filePath: string): Promise<void> {
  if (!hunkManager.fileHasChanges(filePath)) {
    await diffViewManager.closeDiff(filePath);
  }

  if (!hunkManager.hasChanges() && state === TrackingState.StoppedWithPending) {
    state = TrackingState.Idle;
    storageManager.clearSync();
  }
  updateContextKeys();
  statusBarManager.update(state, hunkManager.getChangedFileCount());
}

export async function deactivate(): Promise<void> {
  if (activeSessionId && state !== TrackingState.Idle) {
    const sessionData = snapshotManager.getSessionData(activeSessionId);
    if (sessionData) {
      storageManager.saveSessionSync(sessionData.id, state, sessionData.snapshots);
    }
  } else {
    storageManager.clearSync();
  }

  watcherManager?.dispose();
}
