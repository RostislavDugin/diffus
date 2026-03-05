export const DEBOUNCE_MS = 300;

export const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

export const ADDED_LINE_BG = 'rgba(0, 180, 0, 0.25)';
export const ADDED_LINE_BG_OVERVIEW = 'rgba(0, 180, 0, 0.6)';
export const ADDED_LINE_BORDER = 'rgba(0, 180, 0, 0.8)';

export const REMOVED_LINE_BG = 'rgba(220, 0, 0, 0.25)';
export const REMOVED_LINE_BG_OVERVIEW = 'rgba(220, 0, 0, 0.6)';
export const REMOVED_LINE_BORDER = 'rgba(220, 0, 0, 0.8)';

export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.webm',
  '.avi',
  '.mov',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.obj',
  '.o',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.pyc',
  '.pyo',
  '.class',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.lock',
]);

export const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'out',
  '.vscode-test',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  'bower_components',
  '.DS_Store',
  'Thumbs.db',
];

export const DELETION_MARKER_TEXT_COLOR = 'rgba(220, 80, 80, 0.8)';

const HASH_COMMENT_LANGUAGES = new Set([
  'python',
  'ruby',
  'shellscript',
  'yaml',
  'perl',
  'r',
  'coffeescript',
]);
const DASH_COMMENT_LANGUAGES = new Set(['lua', 'sql']);

export function getCommentPrefix(languageId: string): string {
  if (HASH_COMMENT_LANGUAGES.has(languageId)) {
    return '# ';
  }
  if (DASH_COMMENT_LANGUAGES.has(languageId)) {
    return '-- ';
  }
  return '// ';
}
