import { restoreCache, saveCache } from "@actions/cache";
import {
  endGroup,
  getInput,
  group,
  setFailed,
  startGroup,
  warning,
} from "@actions/core";
import * as path from "path";
import { Executor } from "utils/Executor";
import { hashFile, isReadableFile } from "utils/fs";
import { logInfo } from "utils/log";

//
// Package Managers
//

abstract class PackageManager extends Executor {
  readonly id: string;
  readonly cwd: string;
  readonly lockFile: string;

  protected constructor(cwd: string, id: string, lockFile: string) {
    super({ cwd });

    this.id = id;
    this.cwd = cwd;
    this.lockFile = lockFile;
  }

  getLockFileHash(): Promise<string> {
    return hashFile(path.join(this.cwd, this.lockFile));
  }

  abstract getCachePath(): Promise<string>;
  abstract install(): Promise<void>;
}

class NPM extends PackageManager {
  constructor(cwd: string) {
    super(cwd, "npm", "package-lock.json");
  }

  async getCachePath(): Promise<string> {
    const { stdout } = await this.exec("npm", ["config", "get", "cache"]);

    return stdout;
  }

  async install(): Promise<void> {
    await this.exec("npm", ["ci"]);
  }
}

class Yarn extends PackageManager {
  constructor(cwd: string) {
    super(cwd, "yarn", "yarn.lock");
  }

  async getCachePath(): Promise<string> {
    const { stdout } = await this.exec("yarn", ["cache", "dir"]);

    return stdout;
  }

  async install(): Promise<void> {
    await this.exec("yarn", ["install", "--force", "--frozen-lockfile"]);
  }
}

//
// Cache Manager
//

class CacheManager {
  paths: string[];
  primaryKey: string;
  fallbackKey: string;

  protected cacheHit?: boolean;

  constructor(paths: string[], primaryKey: string, fallbackKey: string) {
    this.paths = paths;
    this.primaryKey = primaryKey;
    this.fallbackKey = fallbackKey;
  }

  async restore(): Promise<boolean> {
    if (this.cacheHit == null) {
      logInfo("Restoring cache from key: '%s'", this.primaryKey);

      try {
        const restoredKey = await restoreCache(this.paths, this.primaryKey, [
          this.fallbackKey,
        ]);

        if (restoredKey) {
          logInfo("Cache restored from key: %s", restoredKey);
        } else {
          logInfo(
            "Cache not found for input keys: %s",
            [this.primaryKey, this.fallbackKey].join(", ")
          );
        }

        this.cacheHit = restoredKey === this.primaryKey;
      } catch (error: unknown) {
        warning(error as Error);

        this.cacheHit = false;
      }
    }

    return this.cacheHit;
  }

  async save(): Promise<boolean> {
    if (this.cacheHit) {
      logInfo(
        "Cache hit occurred on the primary key '%s', not saving cache.",
        this.primaryKey
      );

      return false;
    }

    try {
      await saveCache(this.paths, this.primaryKey);

      return true;
    } catch (error: unknown) {
      // Ignore cache save errors.
      warning(error as Error);
    }

    return false;
  }
}

//
// NPM Install Action
//

class NpmInstallAction extends Executor {
  static create(): NpmInstallAction {
    startGroup("Getting action config");
    const cacheKey = getInput("cache-key", { required: false });
    const workingDirectory = getInput("working-directory", { required: false });

    const action = new NpmInstallAction(
      path.resolve(workingDirectory),
      cacheKey || "npm-v1-"
    );

    logInfo("Working directory set to '%s'", action.cwd);
    logInfo("Cache restore key is '%s'", action.cacheKey);

    endGroup();

    return action;
  }

  readonly cwd: string;
  readonly cacheKey: string;

  constructor(cwd: string, cacheKey: string) {
    super({ cwd });

    this.cwd = cwd;
    this.cacheKey = cacheKey;
  }

  async getManager(): Promise<PackageManager> {
    const { cwd } = this;

    for (const manager of [new NPM(cwd), new Yarn(cwd)]) {
      const lockFilePath = path.join(cwd, manager.lockFile);

      logInfo("Checking if '%s' exists", lockFilePath);

      if (await isReadableFile(lockFilePath)) {
        logInfo("Setting '%s' as default manager…", manager.id);

        return manager;
      }
    }

    throw new Error("Could not file any supported lock file");
  }

  async run(): Promise<void> {
    const { cwd, cacheKey } = this;

    const packageManager = await group("Getting current package manager", () =>
      this.getManager()
    );
    const packageManagerCacheDir = await group(
      `Getting '${packageManager.id}' cache directory`,
      () => packageManager.getCachePath()
    );

    const cacheManager = await group("Getting cache config", async () => {
      const nodeModulesPath = path.join(cwd, "node_modules");
      const lockFileHash = await packageManager.getLockFileHash();
      const manager = new CacheManager(
        [nodeModulesPath, packageManagerCacheDir],
        cacheKey + lockFileHash,
        cacheKey
      );

      logInfo("Cache key set to: '%s'", manager.primaryKey);
      logInfo("Cache paths set to: '%s'", manager.paths.join(", "));

      return manager;
    });

    const isValidCache = await group("Restoring cache", () =>
      cacheManager.restore()
    );

    if (isValidCache) {
      logInfo("Cache is valid, skipping installation");

      return;
    }

    await group(`Installing '${packageManager.id}' dependencies`, () =>
      packageManager.install()
    );

    await group("Saving cache", () => cacheManager.save());
  }
}

NpmInstallAction.create().run().catch(setFailed);
