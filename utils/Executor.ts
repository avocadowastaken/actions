import { exec, ExecOptions } from "@actions/exec";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class Executor {
  protected execDefaults;

  constructor(options: Pick<ExecOptions, "cwd" | "env">) {
    this.execDefaults = options;
  }

  async exec(
    commandLine: string,
    args?: string[],
    options?: ExecOptions
  ): Promise<ExecResult> {
    let stdout = "";
    let stderr = "";

    const exitCode = await exec(commandLine, args, {
      ...this.execDefaults,
      ...options,
      listeners: {
        stdout: (data) => {
          stdout += data.toString("utf8");
        },
        stderr: (data) => {
          stderr += data.toString("utf8");
        },
      },
    });

    return { exitCode, stderr: stderr.trim(), stdout: stdout.trim() };
  }
}
