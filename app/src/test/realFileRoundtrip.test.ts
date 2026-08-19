import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDesignsFile, spliceDesignsFile, encodeDesignsText, type DesignsFile } from "../lib/empire/designsText";
import { serializeDesignEntry } from "../lib/empire/designSerialize";
import { loadEmpiresFromSav } from "../lib/empire/savLoad";

/**
 * LOCAL integration check over gitignored/private files (04-08, D-02/D-04/
 * D-05/D-07/D-08) — NOT part of the deterministic suite. This suite reads:
 *   - the user's real empire designs file (private, never committed here;
 *     path resolved via STELLARIS_DESIGNS_FILE or the known local path
 *     below), 399,931 bytes / 183 top-level entries / CRLF, and
 *   - the repo's sample save (app/public/data/v4.5.0/sample.sav, gitignored,
 *     ~6.25 MB, 133 countries).
 *
 * It self-skips (not fails) when either input is absent, so a clean
 * checkout and CI both stay green. The equivalent guarantees this suite
 * exercises against real data are covered deterministically, against small
 * hand-authored fixtures, by designsText.test.ts, designSerialize.test.ts,
 * designFromSav.test.ts, designsOutputs.test.ts and stageAdd.test.ts.
 *
 * This test NEVER writes any part of the real designs file to disk — it
 * reads, asserts, and lets it go. This file performs read-only filesystem
 * access only; it contains no disk-write calls of any kind.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

const DESIGNS_PATH =
  process.env.STELLARIS_DESIGNS_FILE ??
  "C:\\Users\\alexy\\Documents\\Paradox Interactive\\Stellaris\\user_empire_designs_v3.4.txt";
const SAV_PATH = join(__dirname, "..", "..", "public", "data", "v4.5.0", "sample.sav");

const designsAvailable = existsSync(DESIGNS_PATH);
const savAvailable = existsSync(SAV_PATH);

describe.skipIf(!(designsAvailable && savAvailable))("real-data integration: designs file + sample save", () => {
  it(
    "parses the real 400KB designs file into exactly 183 entries without throwing",
    async () => {
      const bytes = new Uint8Array(readFileSync(DESIGNS_PATH));
      const file = await parseDesignsFile(bytes, "user_empire_designs_v3.4.txt");
      expect(file.entries.length).toBe(183);
    },
    20_000,
  );

  it(
    "zero-change round trip strictly equals the decoded text and re-encodes byte-identical to disk",
    async () => {
      const diskBytes = readFileSync(DESIGNS_PATH);
      const bytes = new Uint8Array(diskBytes);
      const file = await parseDesignsFile(bytes, "user_empire_designs_v3.4.txt");

      const spliced = spliceDesignsFile(file, new Set(), []);
      expect(spliced).toBe(file.text);

      const reencoded = encodeDesignsText(spliced);
      expect(Buffer.from(reencoded).equals(Buffer.from(diskBytes))).toBe(true);
    },
    20_000,
  );

  it(
    "removing one entry drops it from the designs output (182 entries remain); the archive slice contains it verbatim",
    async () => {
      const bytes = new Uint8Array(readFileSync(DESIGNS_PATH));
      const file = await parseDesignsFile(bytes, "user_empire_designs_v3.4.txt");

      const removeIndex = 0;
      const removedEntry = file.entries[removeIndex]!;
      const removedText = file.text.slice(removedEntry.start, removedEntry.end);

      const designsOut = spliceDesignsFile(file, new Set([removeIndex]), []);
      expect(designsOut).not.toContain(removedText);

      const reparsed = await parseDesignsFile(encodeDesignsText(designsOut), "user_empire_designs_v3.4.txt");
      expect(reparsed.entries.length).toBe(182);

      // Build the archive output the same way production code does
      // (useDesignsSession.ts's buildDesignsOutputs): slice the removed
      // entry's original bytes and splice them into a fresh empty archive
      // target via the same engine — never re-serialize a kept/removed entry.
      const emptyArchive: DesignsFile = {
        filename: "user_empire_designs_archive.txt",
        text: "",
        separator: file.separator,
        encoding: file.encoding,
        entries: [],
        warning: null,
      };
      const archiveOut = spliceDesignsFile(emptyArchive, new Set(), [removedText]);
      expect(archiveOut).toContain(removedText);
    },
    20_000,
  );

  it(
    "at least one entry's rawName carries a raw 0x11 colour-escape byte, and it survives a zero-change round trip unchanged",
    async () => {
      const bytes = new Uint8Array(readFileSync(DESIGNS_PATH));
      const file = await parseDesignsFile(bytes, "user_empire_designs_v3.4.txt");

      const esc = String.fromCharCode(0x11);
      const colourEntries = file.entries.filter((e) => e.rawName.includes(esc));
      expect(colourEntries.length).toBeGreaterThan(0);

      const spliced = spliceDesignsFile(file, new Set(), []);
      const entry = colourEntries[0]!;
      const originalSlice = file.text.slice(entry.start, entry.end);
      expect(spliced).toContain(originalSlice);
    },
    20_000,
  );

  it(
    "loading the sample save yields empires with a non-null design; appending a serialized design parses to 184 entries",
    async () => {
      const savBytes = new Uint8Array(readFileSync(SAV_PATH));
      const { empires } = await loadEmpiresFromSav(savBytes);
      const withDesign = empires.filter((e) => e.design !== null);
      expect(withDesign.length).toBeGreaterThan(0);

      const designsBytes = new Uint8Array(readFileSync(DESIGNS_PATH));
      const file = await parseDesignsFile(designsBytes, "user_empire_designs_v3.4.txt");
      const newEntryText = serializeDesignEntry(withDesign[0]!.design!, file.separator);

      const appended = spliceDesignsFile(file, new Set(), [newEntryText]);
      const reparsed = await parseDesignsFile(encodeDesignsText(appended), "user_empire_designs_v3.4.txt");
      expect(reparsed.entries.length).toBe(184);
    },
    30_000,
  );
});
