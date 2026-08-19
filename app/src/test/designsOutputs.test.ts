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

/**
 * Review CR-02: two saves in ONE session. `save()` must re-baseline the
 * ARCHIVE from the archive it just emitted, exactly as it re-baselines the
 * designs file — otherwise archive #2 is built from the stale uploaded
 * archive and silently drops save #1's archived entry, while that design has
 * already been removed from the designs file. This test drives the same
 * re-baseline sequence `save()` performs.
 */
describe("buildDesignsOutputs — repeated saves in one session (archive re-baseline)", () => {
  it("archive #2 contains BOTH removed entries when the emitted archive is fed back as the new baseline", async () => {
    const designs1 = await parseFixture(designsFixtureText());
    const archive0 = await parseFixture(archiveFixtureText(), "user_empire_designs_archive.txt");

    // Save #1: remove entry A.
    const save1 = buildDesignsOutputs(designs1, archive0, new Set([0]), [], spliceDesignsFile);
    expect(save1.archiveText).toContain(ENTRY_A);

    // Re-baseline BOTH outputs, as save() now does.
    const designs2 = await parseFixture(save1.designsText);
    const archive1 = await parseFixture(save1.archiveText!, "user_empire_designs_archive.txt");

    // Save #2: remove what is now the only remaining entry (B).
    const save2 = buildDesignsOutputs(designs2, archive1, new Set([0]), [], spliceDesignsFile);

    expect(save2.archiveText).toContain(ARCHIVED_ENTRY); // the originally uploaded archive
    expect(save2.archiveText).toContain(ENTRY_A); // save #1's removal — the CR-02 regression
    expect(save2.archiveText).toContain(ENTRY_B); // save #2's removal
    expect(save2.designsText.trim()).toBe("");
  });

  it("WITHOUT the archive re-baseline, archive #2 loses save #1's entry (documents the defect being fixed)", async () => {
    const designs1 = await parseFixture(designsFixtureText());
    const archive0 = await parseFixture(archiveFixtureText(), "user_empire_designs_archive.txt");

    const save1 = buildDesignsOutputs(designs1, archive0, new Set([0]), [], spliceDesignsFile);
    const designs2 = await parseFixture(save1.designsText);

    // Stale archive baseline — the old behaviour.
    const save2 = buildDesignsOutputs(designs2, archive0, new Set([0]), [], spliceDesignsFile);
    expect(save2.archiveText).not.toContain(ENTRY_A);
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
