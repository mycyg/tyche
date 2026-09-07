import {defineConfig}from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins:[preact()],
  test:{include:['src/**/*.test.ts','scripts/**/*.test.ts','tests/engine/**/*.test.ts'],environment:'node',setupFiles:['tests/setup.ts']},
});
