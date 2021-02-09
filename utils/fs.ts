import { createHash } from "crypto";
import { constants as fsConstants, createReadStream, promises as fs } from "fs";

export async function isReadableFile(filename: string): Promise<boolean> {
  try {
    await fs.access(filename, fsConstants.R_OK);

    return true;
  } catch {
    return false;
  }
}

export async function hashFile(filepath: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const data of createReadStream(filepath)) {
    hash.update(data);
  }

  return hash.digest("hex");
}
