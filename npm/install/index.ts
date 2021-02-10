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
import set = Reflect.set;

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
  static async create(
    cwd: string,
    cacheKey: string,
    packageManager: PackageManager
  ): Promise<CacheManager> {
    const nodeModulesPath = path.join(cwd, "node_modules");
    const managerCacheDir = await group(
      `Getting '${packageManager.id}' cache directory`,
      () => packageManager.getCachePath()
    );

    const lockFileHash = await packageManager.getLockFileHash();
    const cacheManager = new CacheManager(
      [nodeModulesPath, managerCacheDir],
      cacheKey + lockFileHash,
      cacheKey
    );

    logInfo("Cache key set to: '%s'", cacheManager.primaryKey);
    logInfo("Cache paths set to: '%s'", cacheManager.paths.join(", "));

    return cacheManager;
  }

  paths: string[];
  primaryKey: string;
  fallbackKey: string;

  constructor(paths: string[], primaryKey: string, fallbackKey: string) {
    this.paths = paths;
    this.primaryKey = primaryKey;
    this.fallbackKey = fallbackKey;
  }

  async restore(): Promise<boolean> {
    const restoredKey = await restoreCache(this.paths, this.primaryKey, [
      this.fallbackKey,
    ]);

    return restoredKey === this.primaryKey;
  }

  async save(): Promise<boolean> {
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
  readonly cwd: string;
  readonly cacheKey: string;

  constructor(cwd: string, cacheKey: string) {
    super({ cwd });

    this.cwd = cwd;
    this.cacheKey = cacheKey;

    startGroup("Getting action config");

    logInfo("Working directory set to '%s'", this.cwd);
    logInfo("Cache restore key is '%s'", this.cacheKey);

    endGroup();
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
    const packageManager = await group("Getting current package manager", () =>
      this.getManager()
    );

    const cacheManager = await group("Getting cache config", () =>
      CacheManager.create(this.cwd, this.cacheKey, packageManager)
    );

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

    await group("Save cache", () => cacheManager.save());
  }
}

const cacheKey = getInput("cache-key", { required: false });
const workingDirectory = getInput("working-directory", { required: false });

const action = new NpmInstallAction(
  path.resolve(workingDirectory),
  cacheKey || "npm-v1-"
);

action.run().catch(setFailed);
