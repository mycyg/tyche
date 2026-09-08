import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'*.spec.ts',fullyParallel:false,workers:1,retries:0,
  timeout:30000,expect:{timeout:8000},reporter:[['list']],
  outputDir:'../../test-results/visual',
  use:{baseURL:'http://127.0.0.1:5197/tyche/',browserName:'chromium',viewport:{width:1280,height:720},screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --port 5197 --strictPort',url:'http://127.0.0.1:5197/tyche/',reuseExistingServer:false,cwd:'../..'},
});
