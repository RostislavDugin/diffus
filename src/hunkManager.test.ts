import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HunkManager } from './hunkManager';
import { DiffHunk } from './types';

function makeHunk(id: string, sessionId: string, newStart = 1): DiffHunk {
  return {
    id,
    sessionId,
    oldStart: newStart,
    oldLines: ['old'],
    newStart,
    newLines: ['new'],
  };
}

describe('HunkManager', () => {
  let manager: HunkManager;

  beforeEach(() => {
    manager = new HunkManager();
  });

  describe('setHunksForFile / getAllHunksForFile', () => {
    it('stores and retrieves hunks', () => {
      const hunks = [makeHunk('h1', 's1')];
      manager.setHunksForFile('file.ts', 's1', hunks);
      expect(manager.getAllHunksForFile('file.ts')).toEqual(hunks);
    });

    it('returns empty array for unknown file', () => {
      expect(manager.getAllHunksForFile('unknown.ts')).toEqual([]);
    });

    it('removes file entry when setting empty hunks', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      manager.setHunksForFile('file.ts', 's1', []);
      expect(manager.getAllHunksForFile('file.ts')).toEqual([]);
      expect(manager.getChangedFiles()).not.toContain('file.ts');
    });

    it('supports multiple sessions for the same file', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1', 1)]);
      manager.setHunksForFile('file.ts', 's2', [makeHunk('h2', 's2', 5)]);
      const all = manager.getAllHunksForFile('file.ts');
      expect(all).toHaveLength(2);
    });

    it('replaces existing session hunks', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h2', 's1')]);
      const all = manager.getAllHunksForFile('file.ts');
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('h2');
    });

    it('returns hunks sorted by newStart', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1', 10), makeHunk('h2', 's1', 2)]);
      const all = manager.getAllHunksForFile('file.ts');
      expect(all[0].newStart).toBe(2);
      expect(all[1].newStart).toBe(10);
    });
  });

  describe('getHunkById', () => {
    it('finds a hunk across files', () => {
      manager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      manager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      const result = manager.getHunkById('h2');
      expect(result).toBeDefined();
      expect(result!.filePath).toBe('b.ts');
      expect(result!.hunk.id).toBe('h2');
    });

    it('returns undefined for unknown hunk', () => {
      expect(manager.getHunkById('nonexistent')).toBeUndefined();
    });
  });

  describe('removeHunk', () => {
    it('removes a hunk and returns the file path', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1'), makeHunk('h2', 's1', 5)]);
      const result = manager.removeHunk('h1');
      expect(result).toBe('file.ts');
      expect(manager.getAllHunksForFile('file.ts')).toHaveLength(1);
    });

    it('cleans up file entry when last hunk is removed', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      manager.removeHunk('h1');
      expect(manager.hasChanges()).toBe(false);
    });

    it('returns undefined for unknown hunk', () => {
      expect(manager.removeHunk('nonexistent')).toBeUndefined();
    });
  });

  describe('removeAllHunksForFile', () => {
    it('removes all hunks for a file', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      manager.removeAllHunksForFile('file.ts');
      expect(manager.fileHasChanges('file.ts')).toBe(false);
    });
  });

  describe('state queries', () => {
    it('getChangedFiles returns all files with hunks', () => {
      manager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      manager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      expect(manager.getChangedFiles()).toEqual(['a.ts', 'b.ts']);
    });

    it('getChangedFileCount returns correct count', () => {
      expect(manager.getChangedFileCount()).toBe(0);
      manager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      expect(manager.getChangedFileCount()).toBe(1);
    });

    it('hasChanges returns true when files have hunks', () => {
      expect(manager.hasChanges()).toBe(false);
      manager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      expect(manager.hasChanges()).toBe(true);
    });

    it('fileHasChanges returns correct state', () => {
      expect(manager.fileHasChanges('a.ts')).toBe(false);
      manager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      expect(manager.fileHasChanges('a.ts')).toBe(true);
    });
  });

  describe('getHunkAtLine', () => {
    it('finds hunk containing a line in newStart range', () => {
      const hunk = makeHunk('h1', 's1', 5);
      hunk.newLines = ['a', 'b', 'c']; // lines 5, 6, 7
      manager.setHunksForFile('file.ts', 's1', [hunk]);
      expect(manager.getHunkAtLine('file.ts', 5)?.id).toBe('h1');
      expect(manager.getHunkAtLine('file.ts', 7)?.id).toBe('h1');
    });

    it('returns undefined when no hunk at that line', () => {
      const hunk = makeHunk('h1', 's1', 5);
      manager.setHunksForFile('file.ts', 's1', [hunk]);
      expect(manager.getHunkAtLine('file.ts', 100)).toBeUndefined();
    });
  });

  describe('onDidChange event', () => {
    it('fires when hunks are set', () => {
      const listener = vi.fn();
      manager.onDidChange(listener);
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      expect(listener).toHaveBeenCalledWith('file.ts');
    });

    it('fires when hunks are removed', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      const listener = vi.fn();
      manager.onDidChange(listener);
      manager.removeHunk('h1');
      expect(listener).toHaveBeenCalledWith('file.ts');
    });
  });

  describe('getSessionIdsForFile', () => {
    it('returns session IDs for a file', () => {
      manager.setHunksForFile('file.ts', 's1', [makeHunk('h1', 's1')]);
      manager.setHunksForFile('file.ts', 's2', [makeHunk('h2', 's2', 5)]);
      expect(manager.getSessionIdsForFile('file.ts')).toEqual(['s1', 's2']);
    });

    it('returns empty array for unknown file', () => {
      expect(manager.getSessionIdsForFile('unknown.ts')).toEqual([]);
    });
  });
});
