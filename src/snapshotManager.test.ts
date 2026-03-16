import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace } from 'vscode';
import { readFilesParallel } from './snapshotManager';
import { MAX_FILE_SIZE } from './constants';

describe('readFilesParallel', () => {
  beforeEach(() => {
    vi.mocked(workspace.fs.readFile).mockReset();
  });

  it('populates the snapshot map with file contents', async () => {
    const snapshots = new Map<string, string>();
    const files = ['/workspace/a.ts', '/workspace/b.ts'];

    vi.mocked(workspace.fs.readFile).mockImplementation(async (uri: { fsPath: string }) => {
      const content: Record<string, string> = {
        '/workspace/a.ts': 'const a = 1;',
        '/workspace/b.ts': 'const b = 2;',
      };
      return Buffer.from(content[uri.fsPath] ?? '');
    });

    await readFilesParallel(files, snapshots);

    expect(snapshots.size).toBe(2);
    expect(snapshots.get('/workspace/a.ts')).toBe('const a = 1;');
    expect(snapshots.get('/workspace/b.ts')).toBe('const b = 2;');
  });

  it('skips files larger than MAX_FILE_SIZE', async () => {
    const snapshots = new Map<string, string>();
    const files = ['/workspace/large.bin'];

    vi.mocked(workspace.fs.readFile).mockResolvedValue(
      Buffer.alloc(MAX_FILE_SIZE + 1) as unknown as Uint8Array,
    );

    await readFilesParallel(files, snapshots);

    expect(snapshots.size).toBe(0);
  });

  it('silently catches read errors (deleted files)', async () => {
    const snapshots = new Map<string, string>();
    const files = ['/workspace/exists.ts', '/workspace/deleted.ts', '/workspace/also-exists.ts'];

    vi.mocked(workspace.fs.readFile).mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath === '/workspace/deleted.ts') {
        throw new Error('File not found');
      }
      return Buffer.from('content');
    });

    await readFilesParallel(files, snapshots);

    expect(snapshots.size).toBe(2);
    expect(snapshots.has('/workspace/exists.ts')).toBe(true);
    expect(snapshots.has('/workspace/also-exists.ts')).toBe(true);
    expect(snapshots.has('/workspace/deleted.ts')).toBe(false);
  });

  it('handles empty file list', async () => {
    const snapshots = new Map<string, string>();

    await readFilesParallel([], snapshots);

    expect(snapshots.size).toBe(0);
    expect(workspace.fs.readFile).not.toHaveBeenCalled();
  });

  it('reads files concurrently', async () => {
    const snapshots = new Map<string, string>();
    const files = Array.from({ length: 100 }, (_, i) => `/workspace/file${i}.ts`);
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    vi.mocked(workspace.fs.readFile).mockImplementation(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
      return Buffer.from('x');
    });

    await readFilesParallel(files, snapshots);

    expect(snapshots.size).toBe(100);
    expect(maxConcurrent).toBeGreaterThan(1);
    expect(maxConcurrent).toBeLessThanOrEqual(50);
  });
});
