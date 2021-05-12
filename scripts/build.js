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
  const notSyncedBuilds = [];

  for await (const dir of walk(rootDir)) {
    await execa("npx", ["rapidbundle"], {
      cwd: dir,
      stdio: "inherit",
    });

    if (process.env.CI === "true") {
      const { stdout } = await execa("git", ["status", "--porcelain"]);
      if (stdout) notSyncedBuilds.push(dir.replace(rootDir, ""));
    }
  }

  if (notSyncedBuilds.length > 0) {
    throw new Error(
      `Found not synchronized builds:\n${notSyncedBuilds
        .map((name) => `  ${name}`)
        .join("\n")}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
