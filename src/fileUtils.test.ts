import * as path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBinaryFile, shouldIgnorePath, isFileTooLarge } from './fileUtils';
import { MAX_FILE_SIZE } from './constants';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import { checkGitIgnored, batchCheckGitIgnored } from './fileUtils';

describe('isBinaryFile', () => {
  it('returns true for known binary extensions', () => {
    expect(isBinaryFile('photo.png')).toBe(true);
    expect(isBinaryFile('app.exe')).toBe(true);
    expect(isBinaryFile('archive.zip')).toBe(true);
    expect(isBinaryFile('font.woff2')).toBe(true);
  });

  it('returns false for text file extensions', () => {
    expect(isBinaryFile('main.ts')).toBe(false);
    expect(isBinaryFile('index.js')).toBe(false);
    expect(isBinaryFile('readme.md')).toBe(false);
    expect(isBinaryFile('config.json')).toBe(false);
  });

  it('returns false for files with no extension', () => {
    expect(isBinaryFile('Makefile')).toBe(false);
    expect(isBinaryFile('Dockerfile')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isBinaryFile('photo.PNG')).toBe(true);
    expect(isBinaryFile('photo.Jpg')).toBe(true);
  });
});

describe('shouldIgnorePath', () => {
  it('ignores node_modules paths', () => {
    expect(shouldIgnorePath('/project/node_modules/package/index.js')).toBe(true);
    expect(shouldIgnorePath('C:\\project\\node_modules\\foo')).toBe(true);
  });

  it('ignores .git paths', () => {
    expect(shouldIgnorePath('/project/.git/config')).toBe(true);
  });

  it('ignores dist and out paths', () => {
    expect(shouldIgnorePath('/project/dist/bundle.js')).toBe(true);
    expect(shouldIgnorePath('/project/out/main.js')).toBe(true);
  });

  it('does not ignore normal paths', () => {
    expect(shouldIgnorePath('/project/src/main.ts')).toBe(false);
    expect(shouldIgnorePath('/project/lib/utils.ts')).toBe(false);
  });

  it('does not false-positive on partial matches', () => {
    // "outstanding" contains "out" but shouldn't match
    expect(shouldIgnorePath('/project/src/outstanding.ts')).toBe(false);
  });
});

describe('isFileTooLarge', () => {
  it('returns false for files under the limit', () => {
    expect(isFileTooLarge(1024)).toBe(false);
    expect(isFileTooLarge(0)).toBe(false);
  });

  it('returns false for files exactly at the limit', () => {
    expect(isFileTooLarge(MAX_FILE_SIZE)).toBe(false);
  });

  it('returns true for files over the limit', () => {
    expect(isFileTooLarge(MAX_FILE_SIZE + 1)).toBe(true);
  });
});

describe('checkGitIgnored', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('returns true when git reports file as ignored (exit code 0)', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      (callback as (error: null) => void)(null);
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkGitIgnored('/workspace/debug.log', '/workspace');
    expect(result).toBe(true);
  });

  it('returns false when git reports file as not ignored (exit code 1)', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error('exit code 1'), { code: 1 });
      (callback as (error: Error) => void)(error);
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkGitIgnored('/workspace/src/main.ts', '/workspace');
    expect(result).toBe(false);
  });

  it('returns false when git is not available', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      (callback as (error: Error) => void)(error);
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkGitIgnored('/workspace/file.ts', '/workspace');
    expect(result).toBe(false);
  });
});

describe('batchCheckGitIgnored', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('returns empty set for empty input', async () => {
    const result = await batchCheckGitIgnored([], '/workspace');
    expect(result.size).toBe(0);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns ignored files from git output', async () => {
    const cwd = path.resolve('/workspace');
    const debugLog = path.join(cwd, 'debug.log');
    const mainTs = path.join(cwd, 'src', 'main.ts');
    const outJs = path.join(cwd, 'build', 'out.js');

    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      (callback as (error: null, stdout: string) => void)(null, 'debug.log\0build/out.js\0');
      return {
        stdin: { write: vi.fn(), end: vi.fn() },
      } as unknown as ReturnType<typeof execFile>;
    });

    const result = await batchCheckGitIgnored([debugLog, mainTs, outJs], cwd);

    expect(result.has(debugLog)).toBe(true);
    expect(result.has(outJs)).toBe(true);
    expect(result.has(mainTs)).toBe(false);
  });

  it('returns empty set on error', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const error = new Error('git not found');
      (callback as (error: Error, stdout: string) => void)(error, '');
      return {
        stdin: { write: vi.fn(), end: vi.fn() },
      } as unknown as ReturnType<typeof execFile>;
    });

    const result = await batchCheckGitIgnored(['/workspace/file.ts'], '/workspace');
    expect(result.size).toBe(0);
  });
});
