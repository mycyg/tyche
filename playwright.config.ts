import {defineConfig}from '@playwright/test';

export default defineConfig({
  testDir:'tests/e2e',fullyParallel:true,forbidOnly:!!process.env.CI,retries:0,
  timeout:90_000,expect:{timeout:15_000},
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:5189/tyche/',trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure'},
  projects:[
    {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1440,height:900}}},
    {name:'chromium-portrait',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true}},
    {name:'webkit-portrait',use:{browserName:'webkit',viewport:{width:390,height:844},hasTouch:true}},
    {name:'webkit-landscape',use:{browserName:'webkit',viewport:{width:844,height:390},hasTouch:true}},
  ],
  webServer:{command:'npm run preview -- --port 5189 --strictPort',url:'http://127.0.0.1:5189/tyche/',reuseExistingServer:false},
});
