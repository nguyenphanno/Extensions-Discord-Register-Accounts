import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the logic that has no UI: field matching, export/import and
 * the record guard. The matcher scores real DOM nodes, so the suite runs in
 * jsdom rather than node.
 *
 * Coverage is gated on the pure modules only. A threshold on UI or content code
 * would be noise: those are verified by the build and by using the extension.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/content/FieldMatcher.ts',
        'src/storage/VaultExporter.ts',
        'src/storage/AccountRecordGuard.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
