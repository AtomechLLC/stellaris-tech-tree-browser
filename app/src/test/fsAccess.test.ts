import { describe, it, expect } from "vitest";
import { backupFilename, supportsFsAccess } from "../lib/fsAccess";

/**
 * fsAccess.ts — pure-surface coverage only (backupFilename, supportsFsAccess).
 * DOM-touching functions (downloadBlob, pickTextFileHandle,
 * ensureReadWritePermission, saveInPlaceWithBackup) are exercised by
 * type-check plus the phase's human verification plan (04-08) — this
 * package's vitest environment is `node`, so there is no `document`.
 */

describe("backupFilename", () => {
  it("replaces colons and dots in the ISO stamp with dashes, appends .bak", () => {
    const at = new Date("2026-08-18T19:27:04.123Z");
    expect(backupFilename("user_empire_designs_v3.4.txt", at)).toBe(
      "user_empire_designs_v3.4.txt.2026-08-18T19-27-04-123Z.bak",
    );
  });

  it("is pure and deterministic for a given date", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    const a = backupFilename("archive.txt", at);
    const b = backupFilename("archive.txt", at);
    expect(a).toBe(b);
    expect(a).toBe("archive.txt.2026-01-01T00-00-00-000Z.bak");
  });

  it("leaves the original filename (including its own dots) untouched", () => {
    const at = new Date("2026-03-05T08:09:10.500Z");
    const result = backupFilename("user_empire_designs_archive.txt", at);
    expect(result.startsWith("user_empire_designs_archive.txt.")).toBe(true);
    expect(result.endsWith(".bak")).toBe(true);
  });
});

describe("supportsFsAccess", () => {
  it("returns false when showOpenFilePicker is absent from the global object", () => {
    // Node test environment has no showOpenFilePicker — this is directly assertable.
    expect(supportsFsAccess()).toBe(false);
  });
});
