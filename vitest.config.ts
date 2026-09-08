import {defineConfig}from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins:[preact()],
  test:{maxWorkers:process.env.CI?1:3,minWorkers:1,pool:'forks',poolOptions:{forks:{maxForks:process.env.CI?1:3,minForks:1}},testTimeout:120_000,hookTimeout:120_000,include:['src/**/*.test.ts','scripts/**/*.test.ts','tests/engine/**/*.test.ts'],environment:'node',setupFiles:['tests/setup.ts']},
});
