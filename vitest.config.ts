import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/_upstream/**', '**/dist/**', '**/lib/**'],
    // The suite is I/O-light and finishes in about a second locally, so a
    // generous ceiling costs nothing and stops a loaded CI runner from turning
    // a trivial test red. The first Windows CI run failed this way: a five-event
    // unit test hit the 5s default because the runner was still starting its
    // workers, which is a false negative, not a slow test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
