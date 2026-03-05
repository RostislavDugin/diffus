import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
    },
  },
});
