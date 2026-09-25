/**
 * Unit tests for resolveGovIconSources (v4.5.1 gov icon resolver).
 *
 * Test 1 (exact map): a fixture gameRoot proves the def pass (declared icon +
 *   conventional fallback), the swap sub-block pass (array AND single-object
 *   forms), and the legacy conventional-art scan (civics/origins/authorities)
 *   all contribute exactly the expected 13 ids, with no id missing or extra.
 * Test 2 (exclusions): ids that must NOT appear — no-art defs, an
 *   inherit_icon=yes swap with no art, an unsafe swap name (path traversal),
 *   and size-variant art stems.
 * Test 3 (precedence): a declared `icon =` path wins over the conventional
 *   same-named file for that id — the legacy scan must never overwrite an id
 *   the def pass already resolved.
 * Test 4 (real install, version-agnostic regression guard): every
 *   `advanced_authority_swap` name in the real install that has conventional
 *   art on disk must be a key in the resolved map. This is measured against
 *   whatever version is installed, so it does not pin specific ids and stays
 *   valid across future game patches.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { resolveConfig } from "../src/config.js";
import { parseClausewitzFile, normalizeToArray } from "../src/parser/clausewitz.js";
import { resolveGovIconSources } from "../src/icons/gov-icons.js";

/** Writes a zero-byte fixture file, creating parent directories as needed. */
function touchFile(root: string, ...relSegments: string[]): void {
  const path = join(root, ...relSegments);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "");
}

/** Converts the resolver's absolute-path Map into a plain object of
 *  id -> path relative to the fixture root, with forward slashes, so
 *  expectations are readable and OS-independent. */
function toRelativeMap(root: string, map: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, absPath] of map) {
    out[id] = relative(root, absPath).split(sep).join("/");
  }
  return out;
}

describe("gov-icons: resolveGovIconSources (fixture tree)", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "gov-icons-test-"));

    // --- Def files ---
    mkdirSync(join(root, "common", "governments", "civics"), { recursive: true });
    writeFileSync(
      join(root, "common", "governments", "civics", "00_test_civics.txt"),
      `
civic_declared = {
	icon = "gfx/interface/icons/governments/civics/civic_shared_art.dds"
}
civic_plain = {
}
civic_noart = {
}
civic_with_swap = {
	swap_type = {
		name = "civic_swapped"
	}
}
origin_def = {
	icon = "gfx/interface/icons/origins/origins_def_art.dds"
}
`,
    );

    mkdirSync(join(root, "common", "governments", "authorities"), { recursive: true });
    writeFileSync(
      join(root, "common", "governments", "authorities", "00_test_authorities.txt"),
      `
auth_parent = {
	advanced_authority_swap = {
		name = "auth_swap_a"
		inherit_icon = no
	}
	advanced_authority_swap = {
		name = "auth_swap_inherit"
		inherit_icon = yes
	}
}
auth_single = {
	advanced_authority_swap = {
		name = "auth_swap_single"
	}
}
auth_unsafe = {
	advanced_authority_swap = {
		name = "auth_bad/../name"
	}
}
`,
    );

    // --- Art files (zero-byte; resolution only checks existence) ---
    const civicsArt = [
      "civic_shared_art",
      "civic_declared",
      "civic_plain",
      "civic_swapped",
      "civic_legacy",
      "origin_in_civics",
      "civic_legacy_35x35",
      "not_a_civic",
    ];
    for (const name of civicsArt) {
      touchFile(root, "gfx", "interface", "icons", "governments", "civics", `${name}.dds`);
    }

    const authoritiesArt = ["auth_parent", "auth_swap_a", "auth_swap_single", "auth_legacy", "auth_legacy_35x35"];
    for (const name of authoritiesArt) {
      touchFile(root, "gfx", "interface", "icons", "governments", "authorities", `${name}.dds`);
    }

    const originsArt = ["origins_def_art", "origins_legacy"];
    for (const name of originsArt) {
      touchFile(root, "gfx", "interface", "icons", "origins", `${name}.dds`);
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("Test 1: resolves the exact 13-entry map (def pass + swap sub-blocks + legacy scan)", async () => {
    const result = await resolveGovIconSources(root);
    const actual = toRelativeMap(root, result);

    expect(actual).toEqual({
      // Def pass: declared icon wins; conventional fallback; origin via icon=.
      civic_declared: "gfx/interface/icons/governments/civics/civic_shared_art.dds",
      civic_plain: "gfx/interface/icons/governments/civics/civic_plain.dds",
      origin_def: "gfx/interface/icons/origins/origins_def_art.dds",
      // Swap sub-blocks: civic swap_type, authority parent + array + single-object swap.
      civic_swapped: "gfx/interface/icons/governments/civics/civic_swapped.dds",
      auth_parent: "gfx/interface/icons/governments/authorities/auth_parent.dds",
      auth_swap_a: "gfx/interface/icons/governments/authorities/auth_swap_a.dds",
      auth_swap_single: "gfx/interface/icons/governments/authorities/auth_swap_single.dds",
      // Legacy conventional-art scan (ids with no surviving def).
      civic_shared_art: "gfx/interface/icons/governments/civics/civic_shared_art.dds",
      civic_legacy: "gfx/interface/icons/governments/civics/civic_legacy.dds",
      origin_in_civics: "gfx/interface/icons/governments/civics/origin_in_civics.dds",
      auth_legacy: "gfx/interface/icons/governments/authorities/auth_legacy.dds",
      origin_def_art: "gfx/interface/icons/origins/origins_def_art.dds",
      origin_legacy: "gfx/interface/icons/origins/origins_legacy.dds",
    });
  });

  it("Test 2: excludes no-art defs, inherit_icon swaps with no art, unsafe names, and size variants", async () => {
    const result = await resolveGovIconSources(root);

    for (const excluded of [
      "civic_noart",
      "auth_swap_inherit",
      "auth_unsafe",
      "auth_bad/../name",
      "civic_legacy_35x35",
      "auth_legacy_35x35",
      "not_a_civic",
    ]) {
      expect(result.has(excluded)).toBe(false);
    }
  });

  it("Test 3: a declared icon= path wins over the conventional same-named file", async () => {
    const result = await resolveGovIconSources(root);
    const declared = result.get("civic_declared");

    expect(declared).toBe(join(root, "gfx", "interface", "icons", "governments", "civics", "civic_shared_art.dds"));
    expect(declared).not.toBe(join(root, "gfx", "interface", "icons", "governments", "civics", "civic_declared.dds"));
  });
});

describe("gov-icons: real-install regression guard (version-agnostic)", () => {
  it(
    "Test 4: every advanced_authority_swap name with conventional art resolves, without pinning ids",
    async () => {
      const { gameRoot } = resolveConfig([]);
      const result = await resolveGovIconSources(gameRoot);

      expect(result.size).toBeGreaterThan(0);

      for (const [id, path] of result) {
        expect(existsSync(path)).toBe(true);
        expect(/_\d+x\d+$/.test(id)).toBe(false);
        expect(/^(civic_|origin_|auth_)/.test(id)).toBe(true);
        expect(/^[a-zA-Z0-9_\-@.]+$/.test(id)).toBe(true);
      }

      // Regression guard: parse the real authority defs directly and collect
      // every advanced_authority_swap name that has conventional art on disk.
      // Every such name must be a key in the resolved map.
      const authoritiesDir = join(gameRoot, "common", "governments", "authorities");
      const authArtDir = join(gameRoot, "gfx", "interface", "icons", "governments", "authorities");
      const isPlain = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);

      const expectedSwapIds: string[] = [];
      for (const file of readdirSync(authoritiesDir).filter((f) => f.endsWith(".txt"))) {
        const raw = await parseClausewitzFile(join(authoritiesDir, file));
        for (const val of Object.values(raw)) {
          const block = Array.isArray(val) ? val.find(isPlain) : val;
          if (!isPlain(block)) continue;
          for (const swap of normalizeToArray(block.advanced_authority_swap)) {
            if (!isPlain(swap) || typeof swap.name !== "string") continue;
            if (existsSync(join(authArtDir, `${swap.name}.dds`))) {
              expectedSwapIds.push(swap.name);
            }
          }
        }
      }

      expect(expectedSwapIds.length).toBeGreaterThan(0);
      for (const id of expectedSwapIds) {
        expect(result.has(id)).toBe(true);
      }
    },
    60000,
  );
});
