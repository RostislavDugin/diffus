import * as path from 'path';
import { execFile } from 'child_process';
import { BINARY_EXTENSIONS, IGNORE_PATTERNS, MAX_FILE_SIZE } from './constants';

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

export async function checkGitIgnored(filePath: string, cwd: string): Promise<boolean> {
  const relative = path.relative(cwd, filePath).replace(/\\/g, '/');
  return new Promise<boolean>((resolve) => {
    execFile('git', ['check-ignore', '-q', relative], { cwd }, (error) => {
      if (error && 'code' in error && typeof error.code === 'number') {
        // exit code 1 = not ignored, other codes = error
        resolve(false);
        return;
      }
      // exit code 0 = ignored, or no error
      resolve(!error);
    });
  });
}

export async function batchCheckGitIgnored(filePaths: string[], cwd: string): Promise<Set<string>> {
  if (filePaths.length === 0) {
    return new Set();
  }

  const relativePaths = filePaths.map((fp) => path.relative(cwd, fp).replace(/\\/g, '/'));

  return new Promise<Set<string>>((resolve) => {
    const child = execFile('git', ['check-ignore', '--stdin', '-z'], { cwd }, (error, stdout) => {
      if (error && !stdout) {
        resolve(new Set());
        return;
      }
      const ignoredRelative = stdout.split('\0').filter((s) => s.length > 0);
      const ignoredAbsolute = new Set(ignoredRelative.map((rel) => path.resolve(cwd, rel)));
      resolve(ignoredAbsolute);
    });

    if (child.stdin) {
      child.stdin.write(relativePaths.join('\0'));
      child.stdin.end();
    }
  });
}
