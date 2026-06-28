import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts'],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 95,
        lines: 95
      }
    }
  }
});
