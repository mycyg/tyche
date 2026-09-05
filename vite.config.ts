import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  base: "/tyche/",
  build: { target: "es2022", chunkSizeWarningLimit: 700 },
});
