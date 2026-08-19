import { describe, it, expect } from "vitest";
import {
  findTopLevelSpans,
  decodeDesignsBytes,
  encodeDesignsText,
  parseDesignsFile,
  spliceDesignsFile,
  uniqueDesignName,
  type DesignsFile,
} from "../lib/empire/designsText";

/**
 * D-08 round-trip engine coverage. Fixtures are small, hand-authored,
 * tab-indented, CRLF-terminated entry text mirroring the real design-file
 * shape (04-RESEARCH.md Code Examples) — never the user's real 400KB file.
 */

// Minimal but structurally valid entries (jomini-parseable key=value blocks).
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

function crlfFixture(): string {
  return ENTRY_A + "\r\n" + ENTRY_B + "\r\n";
}

function lfFixture(): string {
  return ENTRY_A.replace(/\r\n/g, "\n") + "\n" + ENTRY_B.replace(/\r\n/g, "\n") + "\n";
}

async function parseFixture(text: string, filename = "user_empire_designs_v3.4.txt"): Promise<DesignsFile> {
  const bytes = new TextEncoder().encode(text);
  return parseDesignsFile(bytes, filename);
}

describe("findTopLevelSpans", () => {
  it("locates two top-level entries in a CRLF fixture", () => {
    const spans = findTopLevelSpans(crlfFixture());
    expect(spans.length).toBe(2);
    expect(spans[0]!.name).toBe("Alarian Consciousness");
    expect(spans[1]!.name).toBe("Quentian Trade Commission");
  });

  it("captures duplicate names as two separate spans", () => {
    // Two entries sharing the exact same raw name, as the real file does
    // (the real file's "Cyrrician Core" appears twice).
    const nameSwapped =
      '"Cyrrician Core"=\r\n{\r\n\tkey="Cyrrician Core"\r\n\tauthority="auth_hive_mind"\r\n}';
    const text = nameSwapped + "\r\n" + nameSwapped + "\r\n";
    const spans = findTopLevelSpans(text);
    expect(spans.length).toBe(2);
    expect(spans[0]!.name).toBe("Cyrrician Core");
    expect(spans[1]!.name).toBe("Cyrrician Core");
  });

  it("survives a raw 0x11 colour-escape byte embedded in the name", () => {
    const esc = String.fromCharCode(0x11);
    const name = `${esc}RRed Empire${esc}!`;
    const text = `"${name}"=\r\n{\r\n\tkey="${name}"\r\n}\r\n`;
    const spans = findTopLevelSpans(text);
    expect(spans.length).toBe(1);
    expect(spans[0]!.name).toBe(name);
  });

  it("throws on an unterminated block (missing final })", () => {
    const broken = '"Alarian Consciousness"=\r\n{\r\n\tkey="Alarian Consciousness"\r\n';
    expect(() => findTopLevelSpans(broken)).toThrow();
  });
});

describe("decodeDesignsBytes", () => {
  it("decodes valid UTF-8 with no warning", () => {
    const bytes = new TextEncoder().encode(crlfFixture());
    const result = decodeDesignsBytes(bytes);
    expect(result.encoding).toBe("utf-8");
    expect(result.warning).toBeNull();
    expect(result.text).toBe(crlfFixture());
  });

  it("falls back to windows-1252 with a warning on invalid UTF-8 bytes", () => {
    // 0xff 0xfe is not valid UTF-8 on its own but decodes fine as windows-1252.
    const bytes = new Uint8Array([0x22, 0xff, 0xfe, 0x22]);
    const result = decodeDesignsBytes(bytes);
    expect(result.encoding).toBe("windows-1252");
    expect(result.warning).not.toBeNull();
  });
});

describe("encodeDesignsText", () => {
  it("round-trips through decodeDesignsBytes on the UTF-8 path", () => {
    const original = crlfFixture();
    const encoded = encodeDesignsText(original);
    const decoded = decodeDesignsBytes(encoded);
    expect(decoded.text).toBe(original);
    expect(decoded.encoding).toBe("utf-8");
  });
});

describe("parseDesignsFile — round-trip identity", () => {
  it("CRLF fixture: splice with no changes strictly equals the original text", async () => {
    const text = crlfFixture();
    const file = await parseFixture(text);
    const out = spliceDesignsFile(file, new Set(), []);
    expect(out).toBe(text);
  });

  it("LF fixture: splice with no changes strictly equals the original text", async () => {
    const text = lfFixture();
    const file = await parseFixture(text);
    expect(file.separator).toBe("\n");
    const out = spliceDesignsFile(file, new Set(), []);
    expect(out).toBe(text);
  });
});

describe("parseDesignsFile — removal and addition", () => {
  it("removing index 0 yields exactly entryB + separator, byte-identical", async () => {
    const text = crlfFixture();
    const file = await parseFixture(text);
    const out = spliceDesignsFile(file, new Set([0]), []);
    const expected = text.slice(file.entries[1]!.start, file.entries[1]!.end) + file.separator;
    expect(out).toBe(expected);
    expect(out).toBe(ENTRY_B + "\r\n");
  });

  it("adding a new entry text appends it with a terminating separator, existing bytes unchanged", async () => {
    const text = crlfFixture();
    const file = await parseFixture(text);
    const newEntryText = '"New Empire"=\r\n{\r\n\tkey="New Empire"\r\n}';
    const out = spliceDesignsFile(file, new Set(), [newEntryText]);
    expect(out).toBe(text + newEntryText + "\r\n");
  });
});

describe("parseDesignsFile — duplicate names", () => {
  it("accepts a fixture with the same quoted name twice (does not throw)", async () => {
    const one = '"Cyrrician Core"=\r\n{\r\n\tkey="Cyrrician Core"\r\n\tauthority="auth_hive_mind"\r\n}';
    const text = one + "\r\n" + one + "\r\n";
    const file = await parseFixture(text);
    expect(file.entries.length).toBe(2);
    expect(file.entries[0]!.rawName).toBe("Cyrrician Core");
    expect(file.entries[1]!.rawName).toBe("Cyrrician Core");
  });
});

describe("parseDesignsFile — fail closed on malformed input", () => {
  it("rejects an unterminated block with the UI-SPEC error copy", async () => {
    const broken = '"Alarian Consciousness"=\r\n{\r\n\tkey="Alarian Consciousness"\r\n';
    const bytes = new TextEncoder().encode(broken);
    await expect(parseDesignsFile(bytes, "bad.txt")).rejects.toThrow(
      "doesn't look like a Stellaris empire designs file",
    );
  });

  it("rejects text whose first non-whitespace character is not a quote", async () => {
    const bytes = new TextEncoder().encode("not a designs file at all\r\n");
    await expect(parseDesignsFile(bytes, "bad.txt")).rejects.toThrow(
      "doesn't look like a Stellaris empire designs file",
    );
  });
});

describe("parseDesignsFile — per-entry metadata", () => {
  it("reads authority and species.class defensively", async () => {
    const file = await parseFixture(crlfFixture());
    expect(file.entries[0]!.authority).toBe("auth_hive_mind");
    expect(file.entries[0]!.speciesClass).toBe("AQUATIC");
    expect(file.entries[1]!.authority).toBe("auth_democratic");
    expect(file.entries[1]!.speciesClass).toBe("MAMMALIAN");
  });

  it("displayName strips Paradox colour codes; rawName keeps them", async () => {
    const esc = String.fromCharCode(0x11);
    const name = `${esc}RRed Empire${esc}!`;
    const text = `"${name}"=\r\n{\r\n\tkey="${name}"\r\n}\r\n`;
    const file = await parseFixture(text);
    expect(file.entries[0]!.rawName).toBe(name);
    expect(file.entries[0]!.displayName).toBe("Red Empire");
  });
});

describe("uniqueDesignName", () => {
  it("returns the desired name unchanged when free", () => {
    expect(uniqueDesignName("Foo", [])).toBe("Foo");
  });

  it("disambiguates a single collision as '(2)'", () => {
    expect(uniqueDesignName("Foo", ["Foo"])).toBe("Foo (2)");
  });

  it("disambiguates a second collision as '(3)'", () => {
    expect(uniqueDesignName("Foo", ["Foo", "Foo (2)"])).toBe("Foo (3)");
  });

  it("compares raw strings, not colour-code-stripped display strings", () => {
    const esc = String.fromCharCode(0x11);
    const raw = `${esc}RFoo${esc}!`;
    // "Foo" (stripped display form) is taken, but the raw colour-coded name
    // is a different byte sequence — must NOT be treated as a collision.
    expect(uniqueDesignName(raw, ["Foo"])).toBe(raw);
  });
});
