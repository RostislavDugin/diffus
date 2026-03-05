import { describe, it, expect } from 'vitest';
import { computeDecorationRanges } from './rangeCalculator';
import { DiffHunk } from './types';

function makeHunk(
  overrides: Partial<DiffHunk> & { oldLines: string[]; newLines: string[] },
): DiffHunk {
  return {
    id: 'h1',
    sessionId: 's1',
    oldStart: 1,
    newStart: 1,
    ...overrides,
  };
}

describe('computeDecorationRanges', () => {
  it('returns empty ranges for empty hunks', () => {
    const result = computeDecorationRanges([]);
    expect(result.addedRanges).toEqual([]);
    expect(result.deletionMarkers).toEqual([]);
  });

  it('computes added ranges for new lines', () => {
    const hunk = makeHunk({ newStart: 3, newLines: ['a', 'b'], oldLines: [] });
    const result = computeDecorationRanges([hunk]);
    expect(result.addedRanges).toHaveLength(2);
    // newStart is 1-based, Range is 0-based: line 3 → index 2
    expect(result.addedRanges[0].start.line).toBe(2);
    expect(result.addedRanges[1].start.line).toBe(3);
    expect(result.deletionMarkers).toHaveLength(0);
  });

  it('computes deletion markers for removed lines', () => {
    const hunk = makeHunk({ oldStart: 2, newStart: 2, oldLines: ['removed'], newLines: [] });
    const result = computeDecorationRanges([hunk]);
    expect(result.addedRanges).toHaveLength(0);
    expect(result.deletionMarkers).toHaveLength(1);
    expect(result.deletionMarkers[0].line).toBe(1); // 0-based: newStart-1 = 1
    expect(result.deletionMarkers[0].count).toBe(1);
    expect(result.deletionMarkers[0].content).toBe('removed');
  });

  it('handles mixed hunks (adds and deletes)', () => {
    const hunk = makeHunk({
      oldStart: 1,
      newStart: 1,
      oldLines: ['old'],
      newLines: ['new'],
    });
    const result = computeDecorationRanges([hunk]);
    expect(result.addedRanges).toHaveLength(1);
    expect(result.deletionMarkers).toHaveLength(1);
  });

  it('truncates long deletion content at 120 chars', () => {
    const longLine = 'x'.repeat(200);
    const hunk = makeHunk({ oldLines: [longLine], newLines: [] });
    const result = computeDecorationRanges([hunk]);
    expect(result.deletionMarkers[0].content.length).toBeLessThanOrEqual(121); // 120 + ellipsis
    expect(result.deletionMarkers[0].content).toContain('…');
  });

  it('joins multiple old lines with " | "', () => {
    const hunk = makeHunk({ oldLines: ['a', 'b', 'c'], newLines: [] });
    const result = computeDecorationRanges([hunk]);
    expect(result.deletionMarkers[0].content).toBe('a | b | c');
    expect(result.deletionMarkers[0].count).toBe(3);
  });

  it('sorts hunks by newStart', () => {
    const hunk1 = makeHunk({ id: 'h1', newStart: 5, newLines: ['late'], oldLines: [] });
    const hunk2 = makeHunk({ id: 'h2', newStart: 1, newLines: ['early'], oldLines: [] });
    const result = computeDecorationRanges([hunk1, hunk2]);
    expect(result.addedRanges[0].start.line).toBe(0); // newStart=1 → 0-based=0
    expect(result.addedRanges[1].start.line).toBe(4); // newStart=5 → 0-based=4
  });

  it('marker line is clamped to 0 for newStart=0', () => {
    const hunk = makeHunk({ newStart: 0, oldLines: ['deleted'], newLines: [] });
    const result = computeDecorationRanges([hunk]);
    expect(result.deletionMarkers[0].line).toBe(0);
  });
});
