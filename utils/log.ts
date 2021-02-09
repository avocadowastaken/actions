import { info } from "@actions/core";
import * as chalk from "chalk";
import * as path from "path";
import * as util from "util";

function colorize(value: unknown): unknown {
  if (typeof value === "string") {
    if (value === "yarn" || value === "yarn.lock") {
      return chalk.cyan(value);
    }

    if (value === "npm" || value === "package-lock.json") {
      return chalk.red(value);
    }

    if (value === "cypress") {
      return chalk.green(value);
    }

    if (path.isAbsolute(value)) {
      return chalk.blue(value);
    }
  }

  return value;
}

export function logInfo(format: string, ...args: unknown[]): void {
  info(util.format(format, ...args.map(colorize)));
}
