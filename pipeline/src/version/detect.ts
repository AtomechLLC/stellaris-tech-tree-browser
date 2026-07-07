/**
 * Game version auto-detection (D-02).
 *
 * Reads `rawVersion` from `launcher-settings.json` at the install root and
 * returns it verbatim (e.g. "v4.5.0") — never hand-entered.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function detectGameVersion(gameRoot: string): string {
  const launcherSettingsPath = join(gameRoot, "launcher-settings.json");

  if (!existsSync(launcherSettingsPath)) {
    throw new Error(
      `detectGameVersion: launcher-settings.json not found at "${launcherSettingsPath}"`,
    );
  }

  const raw = readFileSync(launcherSettingsPath, "utf8");
  const parsed = JSON.parse(raw) as { rawVersion?: string };

  if (!parsed.rawVersion) {
    throw new Error(
      `detectGameVersion: "rawVersion" field is absent from launcher-settings.json (D-16 fail-loud)`,
    );
  }

  return parsed.rawVersion;
}
