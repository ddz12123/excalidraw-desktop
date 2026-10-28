import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const builderCli = require.resolve("electron-builder/cli.js");
const outDir = mkdtempSync(path.join(tmpdir(), "excalidraw-desktop-build-"));
const releaseDir = path.join(root, "release-build");

const cleanup = () => {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch (error) {
    console.warn("Could not remove temporary build directory:", error);
  }
};

const result = spawnSync(
  process.execPath,
  [
    builderCli,
    ...process.argv.slice(2),
    "--publish",
    "never",
    "--config.electronDist=node_modules/electron/dist",
    `--config.directories.output=${outDir}`,
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
      ELECTRON_BUILDER_BINARIES_MIRROR:
        "https://npmmirror.com/mirrors/electron-builder-binaries/",
    },
  },
);

if (result.error || result.status !== 0) {
  cleanup();
  console.error(
    result.error ?? `electron-builder exited with ${result.status}`,
  );
  process.exit(result.status ?? 1);
}

mkdirSync(releaseDir, { recursive: true });

const isArtifact = (file) =>
  /\.(exe|dmg|zip|AppImage|deb|blockmap)$/i.test(file) ||
  /^latest.*\.yml$/i.test(file);

// a renamed artifact would otherwise linger next to the new build
for (const stale of readdirSync(releaseDir).filter(isArtifact)) {
  try {
    rmSync(path.join(releaseDir, stale));
  } catch (error) {
    console.warn(`Could not remove outdated ${stale}:`, error);
  }
}

const artifacts = readdirSync(outDir).filter(isArtifact);

if (!artifacts.length) {
  cleanup();
  console.error("No installer artifacts were produced.");
  process.exit(1);
}

for (const artifact of artifacts) {
  copyFileSync(path.join(outDir, artifact), path.join(releaseDir, artifact));
  console.log(`Copied ${artifact} -> ${releaseDir}`);
}

cleanup();
