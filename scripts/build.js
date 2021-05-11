// import { create as createGlob } from "@actions/glob";
// import { build } from "esbuild";
// import * as path from "path";
//
// const ROOT_DIR = path.join(__dirname, "..");
//
// async function main(): Promise<void> {
//   const glob = await createGlob(`
//     ${ROOT_DIR}/**/action.yml
//     !${ROOT_DIR}/node_modules
//   `);
//
//   for await (const actionPath of glob.globGenerator()) {
//     const actionDir = path.dirname(actionPath);
//     const entryPath = path.join(actionDir, "index.ts");
//     const outPath = path.join(actionDir, "dist", "index.js");
//
//     await build({
//       bundle: true,
//       entryPoints: [entryPath],
//       outfile: outPath,
//
//       target: "node12",
//       platform: "node",
//
//       // Only perform syntax optimization
//       minifySyntax: true,
//
//       // Prefer ESM versions
//       mainFields: ["module", "main"],
//
//       external: [
//         // Optional dependency of the `node-fetch`.
//         "encoding",
//       ],
//
//       // Fix for the https://github.com/node-fetch/node-fetch/issues/784
//       keepNames: true,
//     });
//   }
// }

const path = require("path");
const execa = require("execa");
const { promises: fs } = require("fs");

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string, void>}
 */
async function* walk(dir) {
  const items = await fs.readdir(dir);

  if (items.includes("action.yml")) {
    yield dir;
  } else {
    for (const item of items) {
      if (item.startsWith(".")) continue;
      if (item === "node_modules") continue;

      const itemPath = path.join(dir, item);
      const itemStat = await fs.stat(itemPath);

      if (itemStat.isDirectory()) {
        yield* walk(itemPath);
      }
    }
  }
}

async function main() {
  const rootDir = path.join(__dirname, "..");

  for await (const dir of walk(rootDir)) {
    await execa("npx", ["rapidbundle"], {
      cwd: dir,
      stdio: "inherit",
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
