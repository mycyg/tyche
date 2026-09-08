import {defineConfig}from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins:[preact()],
  test:{maxWorkers:3,minWorkers:1,pool:'forks',poolOptions:{forks:{maxForks:3,minForks:1}},include:['src/**/*.test.ts','scripts/**/*.test.ts','tests/engine/**/*.test.ts'],environment:'node',setupFiles:['tests/setup.ts']},
});
