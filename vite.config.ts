import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import {resolve}from 'node:path';
import {publishedAssets}from './scripts/public-assets';

export default defineConfig({
  plugins: [preact(),{
    name:'tyche-release-assets',apply:'build',
    generateBundle(){for(const asset of publishedAssets(resolve('public')))this.emitFile({type:'asset',...asset});},
  }],
  base: "/tyche/",
  build: { target: "es2022", chunkSizeWarningLimit: 700,copyPublicDir:false },
});
