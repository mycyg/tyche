import {defineConfig}from '@playwright/test';

/** Scene-cast verification. Separate from the shared e2e config and port. */
export default defineConfig({
  testDir:'.',fullyParallel:false,retries:0,workers:1,
  timeout:180_000,expect:{timeout:20_000},
  reporter:[['list']],
  outputDir:'../../test-results/npc',
  use:{baseURL:'http://127.0.0.1:5193/tyche/',trace:'off',screenshot:'off',video:'off'},
  projects:[{name:'chromium',use:{browserName:'chromium',viewport:{width:1440,height:900}}}],
  webServer:{command:'npm run preview -- --port 5193 --strictPort',url:'http://127.0.0.1:5193/tyche/',reuseExistingServer:true,cwd:'../..'},
});
