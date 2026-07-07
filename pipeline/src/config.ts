/**
 * Pipeline configuration resolution.
 *
 * D-15: the Stellaris install path is configurable — CLI arg > env var > config
 * file > default. This is the ONLY module allowed to reference the default
 * install path literal; every other module must receive `gameRoot` as a
 * parameter from `resolveConfig()`.
 *
 * D-16: fail loud. `resolveConfig()` throws a clear error if the resolved
 * gameRoot does not exist or does not look like a Stellaris install (missing
 * `launcher-settings.json`) rather than silently returning a bad path.
 *
 * Threat T-01-01: gameRoot is user-configurable and crosses into filesystem
 * (and later child_process) calls. It must never be interpolated into a shell
 * string — only ever passed to fs APIs and, later, execFileSync argument
 * arrays (never a shell string).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_GAME_ROOT = "Z:\\SteamLibrary\\steamapps\\common\\Stellaris";

export interface PipelineConfig {
  gameRoot: string;
}

/**
 * Resolves the Stellaris install path with precedence:
 *   1. CLI arg `--game-root=<path>` (or `--game-root <path>`)
 *   2. Env var `STELLARIS_INSTALL_PATH`
 *   3. Optional config-file value (reserved for future use; not yet read)
 *   4. Default: Z:\SteamLibrary\steamapps\common\Stellaris
 *
 * Throws if the resolved path does not exist or does not contain
 * `launcher-settings.json` (D-15/D-16 fail-loud).
 */
export function resolveConfig(argv: string[] = process.argv.slice(2)): PipelineConfig {
  const gameRoot = resolveGameRoot(argv);

  if (!existsSync(gameRoot)) {
    throw new Error(
      `resolveConfig: gameRoot "${gameRoot}" does not exist. ` +
        `Set STELLARIS_INSTALL_PATH, pass --game-root, or verify the default install path.`,
    );
  }

  const launcherSettingsPath = join(gameRoot, "launcher-settings.json");
  if (!existsSync(launcherSettingsPath)) {
    throw new Error(
      `resolveConfig: gameRoot "${gameRoot}" does not look like a Stellaris install ` +
        `(missing launcher-settings.json). Check the configured path.`,
    );
  }

  return { gameRoot };
}

function resolveGameRoot(argv: string[]): string {
  const cliValue = parseCliGameRoot(argv);
  if (cliValue) return cliValue;

  if (process.env.STELLARIS_INSTALL_PATH) {
    return process.env.STELLARIS_INSTALL_PATH;
  }

  return DEFAULT_GAME_ROOT;
}

function parseCliGameRoot(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--game-root=")) {
      return arg.slice("--game-root=".length);
    }
    if (arg === "--game-root" && argv[i + 1]) {
      return argv[i + 1];
    }
  }
  return undefined;
}
