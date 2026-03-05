import { describe, it, expect } from 'vitest';
import { isBinaryFile, shouldIgnorePath, isFileTooLarge, isGitignored } from './fileUtils';
import ignore from 'ignore';
import { MAX_FILE_SIZE } from './constants';

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

describe('isGitignored', () => {
  it('detects ignored files', () => {
    const ig = ignore().add(['*.log', 'build/']);
    expect(isGitignored(ig, '/workspace', '/workspace/debug.log')).toBe(true);
    expect(isGitignored(ig, '/workspace', '/workspace/build/out.js')).toBe(true);
  });

  it('allows non-ignored files', () => {
    const ig = ignore().add(['*.log']);
    expect(isGitignored(ig, '/workspace', '/workspace/src/main.ts')).toBe(false);
  });
});
