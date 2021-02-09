import { restoreCache, saveCache } from "@actions/cache";
import {
  exportVariable,
  getInput,
  group,
  setFailed,
  warning,
} from "@actions/core";
import { exec } from "@actions/exec";
import * as path from "path";
import { hashFile, isReadableFile } from "utils/fs";
import { logInfo } from "utils/log";

interface Manager {
  name: string;
  lockFile: string;
  install: () => Promise<void>;
  setCachePath: (cachePath: string) => Promise<void>;
}

interface Binary {
  name: string;
  setCachePath: (cachePath: string) => void | Promise<void>;
  postInstall?: () => void | Promise<void>;
}

function obtainPackageManager(cwd: string): Promise<Manager> {
  const supportedManagers: readonly Manager[] = [
    {
      name: "npm",
      lockFile: "package-lock.json",
      install: async () => {
        await exec("npm", ["ci"]);
      },

      setCachePath: async (cachePath) => {
        await exec("npm", ["config", "set", "cache", cachePath]);
      },
    },
    {
      name: "yarn",
      lockFile: "yarn.lock",
      install: async () => {
        await exec("yarn", ["install", "--force", "--frozen-lockfile"]);
      },

      setCachePath: async (cachePath) => {
        await exec("yarn", ["config", "set", "cache-folder", cachePath]);
      },
    },
  ];

  return group("Obtain package manager", async () => {
    for (const manager of supportedManagers) {
      const { name, lockFile } = manager;

      logInfo("Checking for '%s' file in the '%s' …", lockFile, cwd);

      if (await isReadableFile(path.join(cwd, lockFile))) {
        logInfo("Setting '%s' as default manager…", name);

        return manager;
      }
    }

    throw new Error("Lock file not found");
  });
}

function obtainBinaries(binariesCSV: string): Promise<readonly Binary[]> {
  const supportedBinaries: readonly Binary[] = [
    {
      name: "cypress",
      setCachePath: async (cachePath) => {
        exportVariable("CYPRESS_CACHE_FOLDER", cachePath);
      },

      postInstall: async () => {
        try {
          logInfo("Removing obsolete 'cypress' binaries…");

          await exec("cypress", ["cache", "prune"]);
        } catch (error: unknown) {
          // Old versions of Cypress do not support pruning.
          warning(error as Error);
        }
      },
    },
  ];

  return group("Obtain binaries", async () => {
    const binaries: Binary[] = [];

    binariesCSV = binariesCSV.trim();

    if (binariesCSV) {
      for (let name of binariesCSV.split(",")) {
        const supportedBinary = supportedBinaries.find(
          (binary) => binary.name === name
        );

        if (!supportedBinary) {
          throw new Error(`'${name}' binary is not supported.`);
        }

        logInfo("Adding '%s' binary caching rules…", name);

        binaries.push(supportedBinary);
      }
    }

    if (!binaries.length) {
      logInfo("No extra binaries to cache");
    }

    return binaries;
  });
}

function setCacheDirectories(
  cachePath: string,
  manager: Manager,
  binaries: readonly Binary[]
): Promise<void> {
  return group("Update cache directories", async () => {
    const managerCachePath = path.join(cachePath, manager.name);

    logInfo(
      "Changing '%s' cache directory to '%s' …",
      manager.name,
      managerCachePath
    );

    await manager.setCachePath(managerCachePath);

    for (const { name, setCachePath } of binaries) {
      const packageCachePath = path.join(cachePath, name);

      logInfo(
        "Changing '%s' cache directory to '%s' …",
        name,
        packageCachePath
      );

      await setCachePath(packageCachePath);
    }
  });
}

type CacheState = "empty" | "stale" | "valid";
interface CacheConfig {
  path: string;
  primaryKey: string;
  restoreKey: string;
}

function getCacheConfig(
  cwd: string,
  cacheKey: string,
  { lockFile }: Manager
): Promise<CacheConfig> {
  return group("Cache config", async () => {
    logInfo("Computing cache key for the '%s' …", lockFile);

    const hash = await hashFile(path.join(cwd, lockFile));
    const primaryKey = `${cacheKey}-${hash}`;

    return {
      primaryKey,
      restoreKey: cacheKey,
      path: path.join(cwd, "node_modules"),
    };
  });
}

async function restoreMangerCache(config: CacheConfig): Promise<CacheState> {
  return group("Restore cache", async () => {
    const restoredKey = await restoreCache([config.path], config.primaryKey, [
      config.restoreKey,
    ]);

    const state: CacheState =
      restoredKey === config.primaryKey
        ? "valid"
        : restoredKey
        ? "stale"
        : "empty";

    logInfo("Cache restored with state '%s'", state);

    return state;
  });
}

function installManagerDependencies(
  manager: Manager,
  binaries: readonly Binary[]
): Promise<void> {
  return group("Install Dependencies", async () => {
    logInfo("Installing '%s' dependencies…", manager.name);

    await manager.install();

    for (const { name, postInstall } of binaries) {
      if (postInstall) {
        logInfo("Running post-install task for the '%s' …", name);

        await postInstall();
      }
    }
  });
}

function saveManagerCache(config: CacheConfig): Promise<void> {
  return group("Save cache", async () => {
    try {
      await saveCache([config.path], config.primaryKey);
    } catch (error: unknown) {
      // Ignore cache save errors.
      warning(error as Error);
    }
  });
}

async function main(): Promise<void> {
  const cwd = path.resolve(getInput("working-directory", { required: false }));
  const cacheKey = getInput("cache-key", { required: false });
  const binariesCSV = getInput("binaries", { required: false });

  const cachePath = path.join(cwd, "node_modules", ".cache");

  const manager = await obtainPackageManager(cwd);
  const binaries = await obtainBinaries(binariesCSV);

  await setCacheDirectories(cachePath, manager, binaries);

  const cacheConfig = await getCacheConfig(cwd, cacheKey, manager);
  const cacheState = await restoreMangerCache(cacheConfig);

  if (cacheState === "valid") {
    logInfo("Cache state is 'valid', skipping installation");

    return;
  }

  await installManagerDependencies(manager, binaries);
  await saveManagerCache(cacheConfig);
}

main().catch(setFailed);
