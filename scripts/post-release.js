"use strict";

const execa = require("execa");
const { version } = require("../package.json");

/**
 * @param {string} arg
 * @param {...string} args
 */
async function exec(arg, ...args) {
  console.log(`${arg} ${args.join(" ")}`);
  try {
    const { stdout, stderr } = await execa(arg, args);
    if (stderr) console.warn(stderr);
    if (stdout) console.log(stdout);
  } catch (error) {
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);

    throw error;
  }
}

/**
 * @template {unknown} T
 * @param {string} message
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
async function group(message, fn) {
  console.group("Getting latest tags");
  try {
    return await fn();
  } finally {
    console.groupEnd();
  }
}

async function replaceLatestReleaseTags() {
  const [tag, latestTags] = await group("Getting latest tags", () => {
    console.log("Parsing version: %s", version);
    const [major, minor] = version.split(".");
    const nextTag = `v${version}`;
    const currentTags = [`v${major}`, `v${major}.${minor}`];
    console.log("Resolved tags: %s", currentTags);
    return [nextTag, currentTags];
  });

  await group("Removing tags", async () => {
    await exec("git", "push", "--delete", "origin", ...latestTags).catch(() => {
      console.warn("Failed to remove tags: %s", latestTags);
    });
  });

  await group("Changing tag references", async () => {
    for (const latestTag of latestTags) {
      await exec("git", "tag", "--force", latestTag, tag);
    }

    console.log("Pushing updated tags");
  });

  await group("Pushing updated tags", async () => {
    await exec("git", "push", "origin", "--tags");
  });
}

async function main() {
  await replaceLatestReleaseTags();

  await group("Creating release draft", async () => {
    await exec("yarn", "--silent", "np", "--release-draft-only");
  });
}

main().catch((error) => {
  process.exitCode = 1;

  if ("exitCode" in error) {
    if (error.exitCode) process.exitCode = error.exitCode;
  } else {
    console.error(error);
  }
});
