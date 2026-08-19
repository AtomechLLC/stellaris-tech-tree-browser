import { describe, it, expect } from "vitest";
import { parseDesignsFile, spliceDesignsFile, type DesignsFile } from "../lib/empire/designsText";
import { buildDesignsOutputs, type StagedAdd } from "../lib/empire/useDesignsSession";

/**
 * Pure coverage of `buildDesignsOutputs` (04-06). Fixtures are built the
 * same way as `designsText.test.ts` — small, hand-authored, tab-indented,
 * CRLF-terminated entry text, parsed through the real `parseDesignsFile` so
 * spans are real (never the user's actual 400KB file).
 */

const ENTRY_A =
  '"Alarian Consciousness"=\r\n' +
  "{\r\n" +
  '\tkey="Alarian Consciousness"\r\n' +
  '\tauthority="auth_hive_mind"\r\n' +
  "\tspecies=\r\n" +
  "\t{\r\n" +
  '\t\tclass="AQUATIC"\r\n' +
  "\t}\r\n" +
  "}";

const ENTRY_B =
  '"Quentian Trade Commission"=\r\n' +
  "{\r\n" +
  '\tkey="Quentian Trade Commission"\r\n' +
  '\tauthority="auth_democratic"\r\n' +
  "\tspecies=\r\n" +
  "\t{\r\n" +
  '\t\tclass="MAMMALIAN"\r\n' +
  "\t}\r\n" +
  "}";

const ARCHIVED_ENTRY =
  '"Old Retired Empire"=\r\n' +
  "{\r\n" +
  '\tkey="Old Retired Empire"\r\n' +
  '\tauthority="auth_democratic"\r\n' +
  "}";

function designsFixtureText(): string {
  return ENTRY_A + "\r\n" + ENTRY_B + "\r\n";
}

function archiveFixtureText(): string {
  return ARCHIVED_ENTRY + "\r\n";
}

async function parseFixture(text: string, filename = "user_empire_designs_v3.4.txt"): Promise<DesignsFile> {
  const bytes = new TextEncoder().encode(text);
  return parseDesignsFile(bytes, filename);
}

function stagedAdd(text: string, rawName: string): StagedAdd {
  return { id: rawName, rawName, originalName: rawName, text, sourceEmpireId: 0 };
}

describe("buildDesignsOutputs — no staged changes", () => {
  it("designsText strictly equals the original file text when nothing is staged", async () => {
    const text = designsFixtureText();
    const designs = await parseFixture(text);
    const out = buildDesignsOutputs(designs, null, new Set(), [], spliceDesignsFile);
    expect(out.designsText).toBe(text);
    expect(out.addedCount).toBe(0);
    expect(out.removedCount).toBe(0);
  });

  it("archiveText is null when removed.size === 0, even with staged adds present", async () => {
    const text = designsFixtureText();
    const designs = await parseFixture(text);
    const newEntryText = '"New Empire"=\r\n{\r\n\tkey="New Empire"\r\n}';
    const out = buildDesignsOutputs(designs, null, new Set(), [stagedAdd(newEntryText, "New Empire")], spliceDesignsFile);
    expect(out.archiveText).toBeNull();
    expect(out.addedCount).toBe(1);
  });
});

describe("buildDesignsOutputs — one removal, no uploaded archive", () => {
  it("designsText omits exactly the removed entry's bytes; other entries stay byte-identical", async () => {
    const text = designsFixtureText();
    const designs = await parseFixture(text);
    const out = buildDesignsOutputs(designs, null, new Set([0]), [], spliceDesignsFile);
    const expectedDesignsText =
      text.slice(designs.entries[1]!.start, designs.entries[1]!.end) + designs.separator;
    expect(out.designsText).toBe(expectedDesignsText);
    expect(out.designsText).toBe(ENTRY_B + "\r\n");
  });

  it("archiveText contains exactly the removed entry's text plus a trailing separator, no leading separator, no header", async () => {
    const text = designsFixtureText();
    const designs = await parseFixture(text);
    const out = buildDesignsOutputs(designs, null, new Set([0]), [], spliceDesignsFile);
    expect(out.archiveText).toBe(ENTRY_A + "\r\n");
    expect(out.removedCount).toBe(1);
  });
});

describe("buildDesignsOutputs — removals with an uploaded archive", () => {
  it("archiveText starts with the uploaded archive's original text unchanged (byte-prefix), removed entries appended after", async () => {
    const designsText = designsFixtureText();
    const designs = await parseFixture(designsText);
    const archiveText = archiveFixtureText();
    const archive = await parseFixture(archiveText, "user_empire_designs_archive.txt");

    const out = buildDesignsOutputs(designs, archive, new Set([0]), [], spliceDesignsFile);

    expect(out.archiveText).not.toBeNull();
    expect(out.archiveText!.startsWith(archiveText)).toBe(true);
    expect(out.archiveText).toBe(archiveText + ENTRY_A + "\r\n");
  });

  it("does not re-serialize the uploaded archive's existing entries (identical splice engine, empty removal set)", async () => {
    const designsText = designsFixtureText();
    const designs = await parseFixture(designsText);
    const archiveText = archiveFixtureText();
    const archive = await parseFixture(archiveText, "user_empire_designs_archive.txt");

    const out = buildDesignsOutputs(designs, archive, new Set([0, 1]), [], spliceDesignsFile);

    // The archive's own original bytes are untouched — same string, verbatim.
    expect(out.archiveText!.slice(0, archiveText.length)).toBe(archiveText);
  });
});

describe("buildDesignsOutputs — adds", () => {
  it("added entry texts appear after all kept entries, in staging order", async () => {
    const text = designsFixtureText();
    const designs = await parseFixture(text);
    const addOne = '"First Add"=\r\n{\r\n\tkey="First Add"\r\n}';
    const addTwo = '"Second Add"=\r\n{\r\n\tkey="Second Add"\r\n}';
    const out = buildDesignsOutputs(
      designs,
      null,
      new Set(),
      [stagedAdd(addOne, "First Add"), stagedAdd(addTwo, "Second Add")],
      spliceDesignsFile,
    );
    expect(out.designsText).toBe(text + addOne + "\r\n" + addTwo + "\r\n");
    expect(out.addedCount).toBe(2);
  });
});
