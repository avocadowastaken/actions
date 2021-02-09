import { info } from "@actions/core";
import * as util from "util";

export function logInfo(format: string, ...args: unknown[]): void {
  info(util.format(format, ...args));
}
