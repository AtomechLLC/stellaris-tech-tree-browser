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

/**
 * The human-facing version string exactly as the launcher/main menu shows it —
 * codename, version, and checksum together, e.g. `"Cygnus v4.5.0 (bfcc)"`. The
 * parenthesized token is the game's data checksum (used for mod/save
 * compatibility), pulled out separately so the UI can label it. Read verbatim
 * from `launcher-settings.json` — never hand-entered.
 */
export function detectVersionLabel(gameRoot: string): {
  label: string;
  checksum: string | null;
} {
  const launcherSettingsPath = join(gameRoot, "launcher-settings.json");

  if (!existsSync(launcherSettingsPath)) {
    throw new Error(
      `detectVersionLabel: launcher-settings.json not found at "${launcherSettingsPath}"`,
    );
  }

  const raw = readFileSync(launcherSettingsPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: string };

  if (!parsed.version) {
    throw new Error(
      `detectVersionLabel: "version" field is absent from launcher-settings.json (D-16 fail-loud)`,
    );
  }

  const label = parsed.version.trim();
  // Trailing "(xxxx)" is the data checksum; capture it if present.
  const match = label.match(/\(([^)]+)\)\s*$/);
  return { label, checksum: match ? match[1] : null };
}
