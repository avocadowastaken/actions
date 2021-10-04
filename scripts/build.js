import execa from "execa";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string, void>}
 */
async function* walk(dir) {
  const items = await fs.promises.readdir(dir);

  if (items.includes("action.yml")) {
    yield dir;
  } else {
    for (const item of items) {
      if (item.startsWith(".")) continue;
      if (item === "node_modules") continue;

      const itemPath = path.join(dir, item);
      const itemStat = await fs.promises.stat(itemPath);

      if (itemStat.isDirectory()) {
        yield* walk(itemPath);
      }
    }
  }
}

async function main() {
  const rootDir = path.join(fileURLToPath(import.meta.url), "..", "..");

  for await (const dir of walk(rootDir)) {
    const result = await execa("npx", ["rapidbundle"], {
      cwd: dir,
      reject: false,
      stdio: "inherit",
    });
    if (result.exitCode) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
