import { describe, it, expect } from 'vitest';
import { computeHunks } from './diffEngine';

describe('computeHunks', () => {
  const sessionId = 'test-session';
  const filePath = 'test.ts';

  it('returns empty array for identical content', () => {
    const content = 'line1\nline2\nline3\n';
    expect(computeHunks(content, content, sessionId, filePath)).toEqual([]);
  });

  it('returns empty array for both empty strings', () => {
    expect(computeHunks('', '', sessionId, filePath)).toEqual([]);
  });

  it('detects added lines (new file)', () => {
    const hunks = computeHunks('', 'line1\nline2\n', sessionId, filePath);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toEqual([]);
    expect(hunks[0].newLines).toEqual(['line1', 'line2']);
    expect(hunks[0].newStart).toBe(1);
    expect(hunks[0].sessionId).toBe(sessionId);
  });

  it('detects removed lines (file deleted)', () => {
    const hunks = computeHunks('line1\nline2\n', '', sessionId, filePath);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toEqual(['line1', 'line2']);
    expect(hunks[0].newLines).toEqual([]);
    expect(hunks[0].oldStart).toBe(1);
  });

  it('detects modified lines', () => {
    const hunks = computeHunks('old line\n', 'new line\n', sessionId, filePath);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toEqual(['old line']);
    expect(hunks[0].newLines).toEqual(['new line']);
  });

  it('detects multiple hunks', () => {
    const old = 'a\nb\nc\nd\ne\n';
    const cur = 'a\nB\nc\nd\nE\n';
    const hunks = computeHunks(old, cur, sessionId, filePath);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].oldLines).toEqual(['b']);
    expect(hunks[0].newLines).toEqual(['B']);
    expect(hunks[1].oldLines).toEqual(['e']);
    expect(hunks[1].newLines).toEqual(['E']);
  });

  it('assigns unique hunk IDs', () => {
    const hunks = computeHunks('a\nb\nc\n', 'a\nB\nC\n', sessionId, filePath);
    // Even if they merge into one hunk, IDs should be unique across calls
    const hunks2 = computeHunks('x\n', 'y\n', sessionId, filePath);
    const allIds = [...hunks.map((h) => h.id), ...hunks2.map((h) => h.id)];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('handles insertion in the middle', () => {
    const hunks = computeHunks('a\nc\n', 'a\nb\nc\n', sessionId, filePath);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toEqual([]);
    expect(hunks[0].newLines).toEqual(['b']);
    expect(hunks[0].newStart).toBe(2);
  });

  it('handles deletion from the middle', () => {
    const hunks = computeHunks('a\nb\nc\n', 'a\nc\n', sessionId, filePath);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toEqual(['b']);
    expect(hunks[0].newLines).toEqual([]);
  });
});
