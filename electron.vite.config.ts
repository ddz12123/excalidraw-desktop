import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import svgrPlugin from "vite-plugin-svgr";

const root = __dirname;

const alias = [
  {
    find: /^@excalidraw\/common$/,
    replacement: path.resolve(root, "packages/common/src/index.ts"),
  },
  {
    find: /^@excalidraw\/common\/(.*?)/,
    replacement: path.resolve(root, "packages/common/src/$1"),
  },
  {
    find: /^@excalidraw\/element$/,
    replacement: path.resolve(root, "packages/element/src/index.ts"),
  },
  {
    find: /^@excalidraw\/element\/(.*?)/,
    replacement: path.resolve(root, "packages/element/src/$1"),
  },
  {
    find: /^@excalidraw\/excalidraw$/,
    replacement: path.resolve(root, "packages/excalidraw/index.tsx"),
  },
  {
    find: /^@excalidraw\/excalidraw\/(.*?)/,
    replacement: path.resolve(root, "packages/excalidraw/$1"),
  },
  {
    find: /^@excalidraw\/math$/,
    replacement: path.resolve(root, "packages/math/src/index.ts"),
  },
  {
    find: /^@excalidraw\/math\/(.*?)/,
    replacement: path.resolve(root, "packages/math/src/$1"),
  },
  {
    find: /^@excalidraw\/utils$/,
    replacement: path.resolve(root, "packages/utils/src/index.ts"),
  },
  {
    find: /^@excalidraw\/utils\/(.*?)/,
    replacement: path.resolve(root, "packages/utils/src/$1"),
  },
  {
    find: /^@excalidraw\/fractional-indexing$/,
    replacement: path.resolve(
      root,
      "packages/fractional-indexing/src/index.ts",
    ),
  },
  {
    find: /^@excalidraw\/laser-pointer$/,
    replacement: path.resolve(root, "packages/laser-pointer/src/index.ts"),
  },
];

export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        input: { index: path.resolve(root, "src/main/index.ts") },
      },
    },
  },
  preload: {
    build: {
      rolldownOptions: {
        input: { index: path.resolve(root, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: path.resolve(root, "excalidraw-app"),
    envDir: root,
    base: "./",
    publicDir: path.resolve(root, "public"),
    resolve: {
      alias,
    },
    server: {
      port: 3001,
    },
    build: {
      outDir: path.resolve(root, "out/renderer"),
      emptyOutDir: true,
      sourcemap: true,
      // don't auto-inline small assets (i.e. fonts)
      assetsInlineLimit: 0,
      rolldownOptions: {
        input: path.resolve(root, "excalidraw-app/index.html"),
        output: {
          assetFileNames(chunkInfo) {
            if (chunkInfo?.name?.endsWith(".woff2")) {
              const family = chunkInfo.name.split("-")[0];
              return `fonts/${family}/[name][extname]`;
            }

            return "assets/[name]-[hash][extname]";
          },
        },
      },
    },
    plugins: [react(), svgrPlugin()],
  },
});
