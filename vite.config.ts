import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

function copyRootAssets() {
  return {
    name: "copy-root-assets",
    writeBundle() {
      const assetsToCopy = ["resource.zip"];

      for (const asset of assetsToCopy) {
        const source = resolve(__dirname, asset);
        if (!existsSync(source)) {
          continue;
        }

        const target = resolve(__dirname, "dist", asset);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [copyRootAssets(), cloudflare()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        starter: resolve(__dirname, "starter/index.html"),
      },
    },
  },
});