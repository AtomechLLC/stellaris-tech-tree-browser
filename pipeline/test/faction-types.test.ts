/**
 * Tests for the faction-type / ideology resolver (4.6.0 factions table) and
 * the optional `factions` snapshot field.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../src/config.js";
import {
  expandInlineScripts,
  loadSpriteTextures,
  resolveFactionTypes,
} from "../src/factions/faction-types.js";
import { parseClausewitzText, parseClausewitzFile } from "../src/parser/clausewitz.js";
import { TechSnapshotSchema, FactionTypeSchema } from "../src/schema/tech-snapshot.js";
import { scanAllLocalisation } from "../src/localisation/loc-scanner.js";

function put(root: string, rel: string, text: string): void {
  const p = join(root, ...rel.split("/"));
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
}

const TOTALITARIAN_ICON = "faction_icons_totalitarians";
const IDEO_ICON = "faction_icons_ideological_authoritarian";

describe("faction-types: fixture tree", () => {
  let root: string;
  const locMap = new Map<string, string>([
    ["pft_totalitarian", "Totalitarian Faction"],
    ["pft_ideological_faction_authoritarian", "$ethic_authoritarian$ $ideological_faction$"],
    ["ethic_authoritarian", "Authoritarian"],
    ["ideological_faction", "Faction"],
    ["pft_the_masquerade", "$the_masquerade$"],
    ["the_masquerade", "The Masquerade"],
  ]);

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "faction-types-test-"));
    put(
      root,
      "common/pop_faction_types/00_totalitarian.txt",
      `totalitarian = {
	guiding_ethic = ethic_authoritarian
	inline_script = {
		script = pop_faction_types/ideological_swap
		ETHIC = authoritarian
	}
	swappable_data = {
		default = {
			name = pft_totalitarian
			icon = GFX_faction_icon_totalitarian
		}
	}
}
`,
    );
    put(
      root,
      "common/pop_faction_types/00_secret_societies.txt",
      `inline_script = { script = pop_faction_types/the_masquerade ETHIC = xenophile }
`,
    );
    put(
      root,
      "common/pop_faction_types/99_documentation.txt",
      `# docs only\nignored = { guiding_ethic = ethic_x }\n`,
    );
    put(
      root,
      "common/inline_scripts/pop_faction_types/ideological_swap.txt",
      `swappable_data = {
	swap_type = {
		trigger = { exists = ideology }
		name = pft_ideological_faction_$ETHIC$
		icon = GFX_faction_ideological_$ETHIC$
	}
}
`,
    );
    put(
      root,
      "common/inline_scripts/pop_faction_types/the_masquerade.txt",
      `the_masquerade_$ETHIC$ = {
	swappable_data = {
		default = {
			name = pft_the_masquerade
			icon = GFX_faction_icon_the_masquerade
		}
	}
	guiding_ethic = ethic_$ETHIC$
}
`,
    );
    put(
      root,
      "common/ideologies/00_ideology_types.txt",
      `authoritarian = {
	inline_script = { script = ideologies/ideology_ethic_data ETHIC = authoritarian FACTION = totalitarian }
}
`,
    );
    put(
      root,
      "common/inline_scripts/ideologies/ideology_ethic_data.txt",
      `ethic = ethic_fanatic_$ETHIC$
faction = $FACTION$
`,
    );
    put(
      root,
      "interface/icons.gfx",
      `spriteTypes = {
	spriteType = { name = "GFX_faction_icon_totalitarian" textureFile = "gfx/interface/icons/factions/types/${TOTALITARIAN_ICON}.dds" }
	spriteType = { name = "GFX_faction_ideological_authoritarian" textureFile = "gfx/interface/icons/factions/types/${IDEO_ICON}.dds" }
	spriteType = { name = "GFX_faction_icon_the_masquerade" textureFile = "gfx/interface/icons/factions/types/nonexistent.dds" }
}
`,
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("resolves a faction with ideology and ideological swap", async () => {
    const warnings: string[] = [];
    const sprites = await loadSpriteTextures(root, warnings);
    const { factions } = await resolveFactionTypes(root, locMap, sprites, new Set([TOTALITARIAN_ICON, IDEO_ICON]));
    const t = factions.find((f) => f.key === "totalitarian");
    expect(t).toEqual({
      key: "totalitarian",
      name: "Totalitarian Faction",
      icon: `_factiontype_${TOTALITARIAN_ICON}.webp`,
      guidingEthic: "ethic_authoritarian",
      ideologies: ["authoritarian"],
      ideologyEthics: ["ethic_fanatic_authoritarian"],
      ideologicalName: "Authoritarian Faction",
      ideologicalIcon: `_factiontype_${IDEO_ICON}.webp`,
    });
    expect(factions.find((f) => f.key === "ignored")).toBeUndefined();
  });

  it("expands top-level inline_script into a secret-society faction", async () => {
    const sprites = await loadSpriteTextures(root, []);
    const { factions, warnings } = await resolveFactionTypes(root, locMap, sprites, new Set([TOTALITARIAN_ICON, IDEO_ICON]));
    const m = factions.find((f) => f.key === "the_masquerade_xenophile");
    expect(m).toBeDefined();
    expect(m!.name).toBe("The Masquerade");
    expect(m!.guidingEthic).toBe("ethic_xenophile");
    // sprite resolves to a texture that was never converted -> icon null + warning
    expect(m!.icon).toBeNull();
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic: sorted by key", async () => {
    const sprites = await loadSpriteTextures(root, []);
    const { factions } = await resolveFactionTypes(root, locMap, sprites, new Set([TOTALITARIAN_ICON]));
    const keys = factions.map((f) => f.key);
    expect(keys).toEqual([...keys].sort());
  });

  it("refuses unsafe inline_script paths with a warning, no throw", async () => {
    const warnings: string[] = [];
    const block = await parseClausewitzText(`x = { inline_script = "../../etc/passwd" y = { z = 1 } inline_script = { script = "a b" } }`);
    const out = await expandInlineScripts(block.x as Record<string, unknown>, root, warnings);
    expect(out.inline_script).toBeUndefined();
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to the faction key's own loc entry, then raw key with a warning", async () => {
    const r2 = mkdtempSync(join(tmpdir(), "faction-types-loc-"));
    try {
      put(r2, "common/pop_faction_types/00_a.txt", `alpha = { }\nbeta = { }\n`);
      const { factions, warnings } = await resolveFactionTypes(
        r2,
        new Map([["alpha", "Alpha Loc"]]),
        new Map(),
        new Set(),
      );
      expect(factions.find((f) => f.key === "alpha")!.name).toBe("Alpha Loc");
      expect(factions.find((f) => f.key === "beta")!.name).toBe("beta");
      expect(warnings.some((w) => w.includes("beta"))).toBe(true);
    } finally {
      rmSync(r2, { recursive: true, force: true });
    }
  });
});

describe("factions schema (optional field)", () => {
  const baseMeta = {
    gameVersion: "v0",
    generatedAt: "x",
    techCount: 0,
    areaCounts: {},
    tierCounts: {},
    sourceFiles: [],
  };
  const f = {
    key: "k",
    name: "K",
    icon: null,
    guidingEthic: null,
    ideologies: [],
    ideologyEthics: [],
    ideologicalName: null,
    ideologicalIcon: null,
  };
  it("parses without factions", () => {
    expect(TechSnapshotSchema.safeParse({ meta: baseMeta, techs: {} }).success).toBe(true);
  });
  it("parses with a valid factions table", () => {
    expect(TechSnapshotSchema.safeParse({ meta: baseMeta, techs: {}, factions: { k: f } }).success).toBe(true);
  });
  it("fails when an entry misses name", () => {
    const { name: _n, ...bad } = f;
    expect(FactionTypeSchema.safeParse(bad).success).toBe(false);
    expect(TechSnapshotSchema.safeParse({ meta: baseMeta, techs: {}, factions: { k: bad } }).success).toBe(false);
  });
});

describe("faction-types: real install guard", () => {
  it("resolves a coherent factions table", async () => {
    const { gameRoot } = resolveConfig([]);
    const warnings: string[] = [];
    const sprites = await loadSpriteTextures(gameRoot, warnings);
    const dir = join(gameRoot, "gfx", "interface", "icons", "factions", "types");
    const stems = new Set(
      existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".dds")).map((x) => x.replace(/\.dds$/, "")) : [],
    );
    const locMap = scanAllLocalisation(join(gameRoot, "localisation", "english"));
    const { factions } = await resolveFactionTypes(gameRoot, locMap, sprites, stems);
    expect(factions.length).toBeGreaterThan(0);
    const keys = new Set(factions.map((f) => f.key));
    for (const f of factions) {
      expect(f.name.length).toBeGreaterThan(0);
      for (const ic of [f.icon, f.ideologicalIcon]) {
        if (!ic) continue;
        const m = /^_factiontype_(.+)\.webp$/.exec(ic);
        expect(m, ic).not.toBeNull();
        expect(stems.has(m![1]!), ic).toBe(true);
      }
    }
    // every ideology's faction key exists in the table
    const ideoFile = join(gameRoot, "common", "ideologies", "00_ideology_types.txt");
    const ideos = await parseClausewitzFile(ideoFile);
    let checked = 0;
    for (const [k, v] of Object.entries(ideos)) {
      if (typeof v !== "object" || v === null || Array.isArray(v)) continue;
      const ex = await expandInlineScripts(v as Record<string, unknown>, gameRoot, []);
      if (typeof ex.faction === "string") {
        expect(keys.has(ex.faction), `${k} -> ${ex.faction}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(keys.size).toBe(factions.length);
  }, 120000);
});
