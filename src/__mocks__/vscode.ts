import { vi } from 'vitest';

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => this.listeners.splice(this.listeners.indexOf(listener), 1) };
  };

  fire(data: T) {
    this.listeners.forEach((l) => l(data));
  }

  dispose() {
    this.listeners = [];
  }
}

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
  ) {}

  static file(path: string) {
    return new Uri('file', path);
  }
}

export class RelativePattern {
  constructor(
    public readonly base: { uri: Uri } | Uri | string,
    public readonly pattern: string,
  ) {}
}

export const workspace = {
  openTextDocument: vi.fn(),
  workspaceFolders: [],
  findFiles: vi.fn(),
  fs: {
    readFile: vi.fn(),
    stat: vi.fn(),
  },
  asRelativePath: vi.fn((uri: { fsPath: string } | string) => {
    const fsPath = typeof uri === 'string' ? uri : uri.fsPath;
    return fsPath;
  }),
};

export const env = {
  clipboard: {
    writeText: vi.fn(),
  },
};

export const window = {
  showTextDocument: vi.fn(),
};
