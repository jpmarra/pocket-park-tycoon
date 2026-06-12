import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
