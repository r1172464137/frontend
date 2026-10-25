import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { buildServerInstallCommand } from "./server-install-command";

// Only shell parsing and harmless temporary-directory cleanup run for real.
// These functions intercept both the download and installer execution.
function parseCommand(command: string, downloadExit = 0) {
  return spawnSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      `wget() { printf '%s\\0' wget "$@"; return ${downloadExit}; }
bash() { printf '%s\\0' bash "$@"; }
${command}`,
    ],
    { encoding: "utf8", timeout: 5000 }
  );
}

describe("server install command", () => {
  it.each([
    {
      apiHost: "https://panel.example.test",
      serverId: 7,
      secret: "synthetic-secret",
    },
    {
      apiHost: "https://panel.example.test/a'b; printf HOST_INJECTION; #",
      serverId: "7'; printf ID_INJECTION; #",
      secret:
        "synthetic'; printf SECRET_INJECTION; # $(printf SUBSTITUTION) `printf BACKTICK`\nsecond line",
    },
    { apiHost: "", serverId: 0, secret: "" },
  ])("pins the fork release and passes every value literally: case %#", (input) => {
    const command = buildServerInstallCommand(input);
    expect(command).not.toContain("perfect-panel");
    expect(command).not.toContain("/master/");
    const result = parseCommand(command);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const args = result.stdout.split("\0").slice(0, -1);
    const installerPath = args[2]!;
    expect(installerPath).toMatch(/\/[^/]+\/install\.sh$/);
    expect(args).toEqual([
      "wget",
      "-O",
      installerPath,
      "https://github.com/r1172464137/ppanel-node/releases/download/v1.1.14/install.sh",
      "bash",
      installerPath,
      "v1.1.14",
      "--api-host",
      input.apiHost,
      "--server-id",
      String(input.serverId),
      "--secret-key",
      input.secret,
    ]);
    expect(existsSync(dirname(installerPath))).toBe(false);
  });

  it("does not run an installer after download failure and still cleans up", () => {
    const result = parseCommand(
      buildServerInstallCommand({
        apiHost: "https://panel.example.test",
        serverId: 7,
        secret: "synthetic-secret",
      }),
      73
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(73);
    const args = result.stdout.split("\0").slice(0, -1);
    expect(args).toHaveLength(4);
    expect(args[0]).toBe("wget");
    expect(existsSync(dirname(args[2]!))).toBe(false);
  });
});
