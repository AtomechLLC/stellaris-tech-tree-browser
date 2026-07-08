import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../src/config.js";
import { resolveIconSource } from "../src/icons/resolve.js";
import sharp from "sharp";

// node:child_process's named exports are non-configurable under Node's ESM
// loader, so vi.spyOn(childProcess, 'execFileSync') cannot redefine the
// property directly. vi.mock with importOriginal + a wrapping mock fn is the
// standard vitest ESM workaround -- it still calls the REAL execFileSync
// underneath (via spread), so conversions in Test 4/4b are genuine, not stubbed,
// while still letting us assert the exact call shape (T-04-01 verification).
const execFileSyncMock = vi.fn();
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
      execFileSyncMock(...args);
      return actual.execFileSync(...args);
    },
  };
});

const { convertDdsToWebp, writePlaceholderIcon } = await import("../src/icons/convert.js");

const { gameRoot } = resolveConfig([]);
const ICON_DIR = join(gameRoot, "gfx", "interface", "icons", "technologies");
const PLACEHOLDER_PATH = join(process.cwd(), "assets", "placeholder-icon.webp");

describe("icons: resolveIconSource", () => {
  it("Test 1: an explicit icon= override wins over the tech-key convention", () => {
    // Real corpus fixture: tech_archeology_lab_ancrel has `icon = "tech_archeology_lab"`,
    // a different tech's icon name (RESEARCH.md DATA-04 row).
    const tech = { key: "tech_archeology_lab_ancrel", icon: "tech_archeology_lab" };
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).not.toBeNull();
    expect(resolved.base).toMatch(/tech_archeology_lab\.dds$/);
  });

  it("Test 2: a plain tech with no icon field resolves via the tech_<key>.dds convention", () => {
    const tech = { key: "tech_space_exploration" };
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).not.toBeNull();
    expect(resolved.base).toMatch(/tech_space_exploration\.dds$/);
  });

  it("Test 3: a tech whose expected .dds does not exist on disk returns a null base, not a throw", () => {
    const tech = { key: "tech_this_key_does_not_exist_anywhere_xyz" };
    expect(() => resolveIconSource(tech, gameRoot)).not.toThrow();
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).toBeNull();
  });

  it("Test 4: technology_swap variants with their own .dds file are reported alongside the base icon", () => {
    // Real corpus fixture: tech_basic_science_lab_3 has a multi-arity (array)
    // technology_swap — first entry (tech_wilderness_science_lab_3) has
    // inherit_icon = no and ships its own .dds; second entry (itself,
    // inherit_icon = yes) has no separate file and must be omitted.
    const tech = {
      key: "tech_basic_science_lab_3",
      technology_swap: [
        { name: "tech_wilderness_science_lab_3", inherit_icon: false, inherit_effects: true },
        { name: "tech_basic_science_lab_3", inherit_icon: true, inherit_effects: true },
      ],
    };
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).not.toBeNull();
    expect(resolved.base).toMatch(/tech_basic_science_lab_3\.dds$/);
    expect(resolved.swaps).toHaveLength(1);
    expect(resolved.swaps[0].name).toBe("tech_wilderness_science_lab_3");
    expect(resolved.swaps[0].path).toMatch(/tech_wilderness_science_lab_3\.dds$/);
  });

  it("Test 4b: a single (non-array) technology_swap object is handled without crashing (Pitfall 5 arity)", () => {
    const tech = {
      key: "tech_terrestrial_sculpting",
      technology_swap: { name: "tech_terrestrial_sculpting_wilderness", inherit_icon: true, inherit_effects: false },
    };
    expect(() => resolveIconSource(tech, gameRoot)).not.toThrow();
  });
});

describe("icons: convertDdsToWebp + placeholder fallback", () => {
  let workDir: string;

  afterEach(() => {
    execFileSyncMock.mockClear();
    if (workDir) {
      try {
        rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        // Best-effort cleanup -- Windows can briefly hold a file handle open
        // after a child process/sharp write completes; not a test failure.
      }
    }
  });

  it("Test 1: a real uncompressed tech .dds converts to a valid 52x52 lossless .webp readable by sharp", async () => {
    workDir = mkdtempSync(join(tmpdir(), "icons-test-"));
    const ddsPath = join(ICON_DIR, "tech_space_exploration.dds");
    const pngTemp = join(workDir, "tech_space_exploration.png");
    const webpOut = join(workDir, "tech_space_exploration.webp");

    await convertDdsToWebp(ddsPath, pngTemp, webpOut);

    expect(existsSync(webpOut)).toBe(true);
    const meta = await sharp(webpOut).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(52);
    expect(meta.height).toBe(52);
    // Intermediate PNG temp file is cleaned up after conversion.
    expect(existsSync(pngTemp)).toBe(false);
  });

  it("Test 2: a DXT-compressed icon (DXT3, with genuine non-uniform alpha) converts to a valid readable .webp with alpha preserved", async () => {
    workDir = mkdtempSync(join(tmpdir(), "icons-test-"));
    // Real corpus fixture: tech_cybernetic_brain_implants_1 is DXT3-compressed
    // and has genuinely varying (non-fully-opaque) alpha, verified directly
    // against the source .dds during this plan's research pass.
    const ddsPath = join(ICON_DIR, "tech_cybernetic_brain_implants_1.dds");
    const pngTemp = join(workDir, "cyber.png");
    const webpOut = join(workDir, "cyber.webp");

    await convertDdsToWebp(ddsPath, pngTemp, webpOut);

    expect(existsSync(webpOut)).toBe(true);
    const meta = await sharp(webpOut).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(52);
    expect(meta.height).toBe(52);
    expect(meta.hasAlpha).toBe(true);
  });

  it("Test 3: a missing source resolves to the shipped placeholder without an unhandled exception (D-13)", () => {
    workDir = mkdtempSync(join(tmpdir(), "icons-test-"));
    const destPath = join(workDir, "tech_missing_icon.webp");

    // Simulates assemble.ts's fallback path when resolveIconSource returns a
    // null base: write the shipped placeholder instead of failing the build.
    expect(() => writePlaceholderIcon(PLACEHOLDER_PATH, destPath)).not.toThrow();
    expect(existsSync(destPath)).toBe(true);
  });

  it("Test 4: convertDdsToWebp invokes ImageMagick via execFileSync with an argument array (no shell interpolation)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "icons-test-"));

    const ddsPath = join(ICON_DIR, "tech_space_exploration.dds");
    const pngTemp = join(workDir, "spy-test.png");
    const webpOut = join(workDir, "spy-test.webp");

    await convertDdsToWebp(ddsPath, pngTemp, webpOut);

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = execFileSyncMock.mock.calls[0];
    expect(command).toBe("magick");
    // ARGUMENT ARRAY -- not a single concatenated shell string.
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual([ddsPath, pngTemp]);
    // No shell: true anywhere in the invocation (T-04-01 mitigation).
    expect((options as { shell?: boolean } | undefined)?.shell).toBeFalsy();
  });

  it("Test 4b: a path containing shell metacharacters is passed through convertDdsToWebp as one literal array element", async () => {
    workDir = mkdtempSync(join(tmpdir(), "icons-test-"));

    // A path with a shell metacharacter must reach execFileSync as a single,
    // untouched array element -- never concatenated into a command string
    // where `;` could terminate the command and inject another (T-04-01).
    // The file doesn't exist, so the real execFileSync call underneath the
    // mock wrapper will throw (magick can't open it) -- that's expected;
    // only the call-shape assertion below matters for this test.
    const dangerousDdsPath = join(workDir, "icon; rm -rf all.dds");
    const pngTemp = join(workDir, "spy-test2.png");
    const webpOut = join(workDir, "spy-test2.webp");

    await convertDdsToWebp(dangerousDdsPath, pngTemp, webpOut).catch(() => {});

    expect(execFileSyncMock).toHaveBeenCalledWith("magick", [dangerousDdsPath, pngTemp]);
  });
});
