import { describe, it, expect } from 'vitest';
import { getCommentPrefix } from './constants';

describe('getCommentPrefix', () => {
  it('returns "# " for hash-comment languages', () => {
    expect(getCommentPrefix('python')).toBe('# ');
    expect(getCommentPrefix('ruby')).toBe('# ');
    expect(getCommentPrefix('shellscript')).toBe('# ');
    expect(getCommentPrefix('yaml')).toBe('# ');
    expect(getCommentPrefix('perl')).toBe('# ');
    expect(getCommentPrefix('r')).toBe('# ');
    expect(getCommentPrefix('coffeescript')).toBe('# ');
  });

  it('returns "-- " for dash-comment languages', () => {
    expect(getCommentPrefix('lua')).toBe('-- ');
    expect(getCommentPrefix('sql')).toBe('-- ');
  });

  it('returns "// " for C-style and unknown languages', () => {
    expect(getCommentPrefix('typescript')).toBe('// ');
    expect(getCommentPrefix('javascript')).toBe('// ');
    expect(getCommentPrefix('java')).toBe('// ');
    expect(getCommentPrefix('unknown-language')).toBe('// ');
    expect(getCommentPrefix('')).toBe('// ');
  });
});
