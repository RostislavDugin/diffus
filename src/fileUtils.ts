import * as path from 'path';
import { execFile } from 'child_process';
import { BINARY_EXTENSIONS, IGNORE_PATTERNS, MAX_FILE_SIZE } from './constants';
import { log, logError } from './logger';

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function shouldIgnorePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return IGNORE_PATTERNS.some((pattern) => {
    const segment = `/${pattern}/`;
    return normalized.includes(segment) || normalized.endsWith(`/${pattern}`);
  });
}

export function isFileTooLarge(size: number): boolean {
  return size > MAX_FILE_SIZE;
}

const GIT_TIMEOUT_MS = 5_000;
const GIT_BATCH_TIMEOUT_MS = 10_000;

export async function checkGitIgnored(filePath: string, cwd: string): Promise<boolean> {
  const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
  return new Promise<boolean>((resolve) => {
    const child = execFile(
      'git',
      ['check-ignore', '-q', relative],
      { cwd, timeout: GIT_TIMEOUT_MS },
      (error) => {
        if (error && 'code' in error && typeof error.code === 'number') {
          // exit code 1 = not ignored, other codes = error
          resolve(false);
          return;
        }
        if (error) {
          logError(`git check-ignore failed for ${relative}`, error);
          resolve(false);
          return;
        }
        // exit code 0 = ignored
        resolve(true);
      },
    );

    child.on('error', (err) => {
      logError(`git check-ignore spawn error for ${relative}`, err);
      resolve(false);
    });
  });
}

export async function batchCheckGitIgnored(filePaths: string[], cwd: string): Promise<Set<string>> {
  if (filePaths.length === 0) {
    return new Set();
  }

  const relativePaths = filePaths.map((fp) => path.relative(cwd, fp).replace(/\\/g, '/'));

  return new Promise<Set<string>>((resolve) => {
    let resolved = false;
    const safeResolve = (value: Set<string>) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    const timer = setTimeout(() => {
      logError(`git check-ignore --stdin timed out after ${GIT_BATCH_TIMEOUT_MS}ms`);
      safeResolve(new Set());
    }, GIT_BATCH_TIMEOUT_MS);

    const child = execFile(
      'git',
      ['check-ignore', '--stdin', '-z'],
      { cwd, timeout: GIT_BATCH_TIMEOUT_MS },
      (error, stdout) => {
        clearTimeout(timer);
        if (error && !stdout) {
          logError('git check-ignore --stdin failed', error);
          safeResolve(new Set());
          return;
        }
        const ignoredRelative = stdout.split('\0').filter((s) => s.length > 0);
        const ignoredAbsolute = new Set(ignoredRelative.map((rel) => path.resolve(cwd, rel)));
        log(`git check-ignore: ${ignoredAbsolute.size} of ${filePaths.length} files ignored`);
        safeResolve(ignoredAbsolute);
      },
    );

    child.on('error', (err) => {
      clearTimeout(timer);
      logError('git check-ignore --stdin spawn error', err);
      safeResolve(new Set());
    });

    try {
      if (child.stdin) {
        child.stdin.write(relativePaths.join('\0'));
        child.stdin.end();
      } else {
        logError('git check-ignore --stdin: stdin not available');
        clearTimeout(timer);
        safeResolve(new Set());
      }
    } catch (err) {
      logError('git check-ignore --stdin: failed to write to stdin', err);
      clearTimeout(timer);
      safeResolve(new Set());
    }
  });
}
