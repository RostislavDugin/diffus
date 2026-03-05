import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationManager } from './navigationManager';
import { HunkManager } from './hunkManager';
import { DiffHunk } from './types';

function makeHunk(id: string, sessionId: string): DiffHunk {
  return { id, sessionId, oldStart: 1, oldLines: ['old'], newStart: 1, newLines: ['new'] };
}

describe('NavigationManager', () => {
  let hunkManager: HunkManager;
  let nav: NavigationManager;

  beforeEach(() => {
    hunkManager = new HunkManager();
    nav = new NavigationManager(hunkManager);
  });

  describe('getCounterText', () => {
    it('returns empty string with no files', () => {
      expect(nav.getCounterText()).toBe('');
    });

    it('returns "1 / 1 files" with one file', () => {
      hunkManager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      expect(nav.getCounterText()).toBe('1 / 1 files');
    });

    it('returns correct counter with multiple files', () => {
      hunkManager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      hunkManager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      hunkManager.setHunksForFile('c.ts', 's1', [makeHunk('h3', 's1')]);
      expect(nav.getCounterText()).toBe('1 / 3 files');
    });
  });

  describe('nextFile / prevFile', () => {
    it('nextFile advances the index', async () => {
      hunkManager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      hunkManager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      await nav.nextFile();
      expect(nav.getCounterText()).toBe('2 / 2 files');
    });

    it('nextFile wraps around', async () => {
      hunkManager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      hunkManager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      await nav.nextFile(); // index 1
      await nav.nextFile(); // wraps to 0
      expect(nav.getCounterText()).toBe('1 / 2 files');
    });

    it('prevFile wraps to last', async () => {
      hunkManager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      hunkManager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      await nav.prevFile(); // wraps from 0 to 1
      expect(nav.getCounterText()).toBe('2 / 2 files');
    });

    it('does nothing when no files exist', async () => {
      await nav.nextFile();
      await nav.prevFile();
      expect(nav.getCounterText()).toBe('');
    });
  });

  describe('getCounterText clamps index', () => {
    it('resets index when files list shrinks', () => {
      hunkManager.setHunksForFile('a.ts', 's1', [makeHunk('h1', 's1')]);
      hunkManager.setHunksForFile('b.ts', 's1', [makeHunk('h2', 's1')]);
      hunkManager.setHunksForFile('c.ts', 's1', [makeHunk('h3', 's1')]);
      // Simulate index at 2 (third file)
      // We need to advance to index 2
      // Then remove files so index is out of bounds
      // getCounterText should clamp
      // Since we can't directly set index, navigate forward twice
      nav.nextFile(); // 1
      nav.nextFile(); // 2
      // Remove two files
      hunkManager.removeAllHunksForFile('b.ts');
      hunkManager.removeAllHunksForFile('c.ts');
      // Only 'a.ts' remains, index=2 is out of bounds
      expect(nav.getCounterText()).toBe('1 / 1 files');
    });
  });
});
