# Phase 4: Empire Manager - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 11 (7 new, 3 modified, 1 CSS)
**Analogs found:** 9 / 11 (2 have no strong direct code analog — flagged below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/src/lib/empire/savLoad.ts` (MODIFY — expose raw `country`/`species_db`/`leaders`) | service (parser) | transform | itself (existing `extractGalaxy` sibling-export pattern) | exact |
| `app/src/lib/empire/designsText.ts` (NEW — span scanner + splice) | utility (parser/splicer) | transform | `app/src/lib/pdxText.ts` (char-by-char state machine) + `savLoad.ts` (module shape) | role-match |
| `app/src/lib/empire/designSchema.ts` (NEW — LocName parse/serialize) | model/utility | transform | `app/src/lib/pdxText.ts` (small self-contained parse+serialize pair) | role-match |
| `app/src/lib/empire/designFromSav.ts` (NEW — extractDesignFromCountry) | service (extractor/mapper) | transform | `savLoad.ts` country-extraction loop (lines 143-195) | exact |
| `app/src/lib/empire/designSerialize.ts` (NEW — hand-rolled tab-indented writer) | utility (serializer) | transform | none direct — see "No Analog Found" | partial |
| `app/src/lib/fsAccess.ts` (NEW — FS Access wrapper + backup + download fallback) | utility (browser I/O) | file-I/O | `app/src/lib/export/mapImage.ts` (Blob + `a[download]`, lines 124-131) | role-match |
| `app/src/components/EmpireManagerPanel.tsx` (NEW — manager dialog) | component (modal) | event-driven / CRUD | `WhatsNew.tsx` (dialog chrome) + `FindOverlay.tsx` (filter+list+keyboard) + `EmpireSettingsPanel` (docked-panel rows, inline in `EmpirePanel.tsx` lines 285-362) | role-match |
| `app/src/components/EmpirePanel.tsx` (MODIFY — add entry-point + "Add to my empires" action) | component (panel) | event-driven | itself (existing `showSettings` toggle button, lines 184-193) | exact |
| `app/src/styles/app.css` (MODIFY — new dialog/list/badge rules) | style | — | `.whats-new`, `.find-overlay`/`.find-box`, `.empire-drop`, `.empire-chip`, `.empire-settings` blocks (all in this file) | exact |
| `app/src/test/designsText.test.ts` (NEW) | test | — | `app/src/test/empire-classify.test.ts` | exact |
| `app/src/test/designFromSav.test.ts` (NEW) | test | — | `app/src/test/empire-classify.test.ts` (fixture-object style) + `app/src/test/smoke.test.ts` (real-file fixture loading) | role-match |

---

## Pattern Assignments

### `app/src/lib/empire/savLoad.ts` (MODIFY)

**Analog:** itself — follow the existing `extractGalaxy` pattern (a second top-level export reading the same parsed `root`, alongside the primary `loadEmpiresFromSav` export).

**Module header / lazy-load contract** (lines 1-12):
```typescript
/**
 * Saved Empire (spike 005) — client-side .sav loader.
 * ...
 * NOTE (spike): jomini + fflate land in the app's main bundle here. The real
 * build should lazy-load this module so the tree app isn't paying for the parser
 * until the user opens the Saved Empire tab.
 */
import { unzipSync } from "fflate";
import { Jomini } from "jomini";
import type { RawEmpire } from "./gates";
```
Extend this same file rather than forking — add exports like `getRawCountry(root, id)` / `getSpeciesDb(root)` / `getLeaders(root)` that return the untyped parsed subtrees, reusing the already-parsed `root` (don't re-parse).

**Helper style to reuse** (lines 60-65):
```typescript
function toArr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```
`designFromSav.ts` should import (or re-declare, matching exactly) these same two helpers — every save-tree read in the codebase uses this pair.

**Sibling-extractor pattern** (`extractGalaxy`, lines 213-218 — same shape to follow for exposing raw subtrees):
```typescript
function extractGalaxy(root: Record<string, any>): SavGalaxy | null {
  const objects = root.galactic_object;
  if (!isObj(objects)) return null;
  ...
```

**Ethics gotcha to preserve verbatim** (lines 162-173) — RESEARCH.md confirms the SAME gotcha applies to the design file's `ethic=` field:
```typescript
// Ethics live under `ethos = { ethic = "ethic_x" ethic = "ethic_y" }` —
// the key is `ethic` (singular, repeated → jomini array), NOT `ethics`.
// (Reading the wrong key silently emptied every empire's ethics, which
// also broke has_ethic gate evaluation.)
let ethics: string[] = [];
if (isObj(c.ethos)) for (const e of toArr(c.ethos.ethic)) if (typeof e === "string") ethics.push(e);
```

**Error handling pattern** (lines 68-74):
```typescript
export async function loadEmpiresFromSav(savBytes: Uint8Array): Promise<SavLoadResult> {
  if (!parser) parser = await Jomini.initialize();
  const t0 = performance.now();
  const files = unzipSync(savBytes);
  const gs = files["gamestate"];
  if (!gs) throw new Error("This .sav has no gamestate entry — is it a valid Stellaris save?");
```
Throw plain `Error` with a user-facing message; the caller (`EmpirePanel`'s `handleBytes`) catches it via `e instanceof Error ? e.message : String(e)`. Reuse this exact throw/catch contract for designs-file parsing too.

---

### `app/src/lib/empire/designsText.ts` (NEW)

**Analog 1 — state-machine scanning shape:** `app/src/lib/pdxText.ts` (full file, 84 lines) — a char-by-char loop tracking a small piece of state (color stack) and flushing segments; `designsText.ts`'s span scanner is the same shape (track quote/brace state, flush spans) applied to a different grammar.

**Analog 2 — module lazy-load + parse/throw contract:** `savLoad.ts` lines 1-12, 68-74 (see above) — designs parsing should follow the identical "lazy-imported module, throws plain `Error` with a user-facing message on malformed input" contract, per RESEARCH.md's V5 Input Validation note ("fail closed... rather than guessing at boundaries").

**Primary source — RESEARCH.md already contains the verified implementation** (Pattern 1, `04-RESEARCH.md` lines 315-339) — use this directly rather than re-deriving it:
```typescript
interface EntrySpan {
  name: string;
  start: number;
  end: number;
}
function findTopLevelSpans(text: string): EntrySpan[] {
  const spans: EntrySpan[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length || text[i] !== '"') break; // EOF or malformed — stop, don't guess
    const nameStart = i;
    i++;
    let name = "";
    while (i < text.length && text[i] !== '"') { name += text[i]; i++; }
    i++;
    while (i < text.length && text[i] !== "{") i++;
    let depth = 0, inQuotes = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === "{") depth++;
      else if (!inQuotes && ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    spans.push({ name, start: nameStart, end: i });
  }
  return spans;
}
```

**Encoding note (Pitfall 1, RESEARCH.md):** decode as UTF-8 (`new TextDecoder("utf-8", { fatal: true })`), NOT `windows-1252` like `savLoad.ts` — this is the one place a copy-paste from `savLoad.ts` would introduce a real bug.

---

### `app/src/lib/empire/designSchema.ts` (NEW)

**Analog:** `app/src/lib/pdxText.ts` — same "one small, self-contained parse+serialize pair, exported as plain functions, no class" shape:
```typescript
export interface PdxSegment {
  color: string | null;
  text: string;
}
export function parsePdxText(raw: string): PdxSegment[] { ... }
export function stripPdxCodes(raw: string): string { ... }
```
`designSchema.ts` should mirror this exactly: `export interface LocName { ... }`, `export function parseLocName(...)`, `export function serializeLocName(...)`. RESEARCH.md Pattern 2 (`04-RESEARCH.md` lines 342-375) has the verified field shapes (literal / loc-key / `%ADJECTIVE%`-variable-template forms) to implement against — no codebase analog exists for the variable-template shape itself, only for the module's *shape*.

---

### `app/src/lib/empire/designFromSav.ts` (NEW)

**Analog:** `savLoad.ts`'s country-extraction loop — the strongest analog in the entire codebase for this file, same job (walk a raw parsed jomini country object, pull typed fields with fallbacks).

**Core mapping-with-fallback pattern to copy** (`savLoad.ts` lines 160-193):
```typescript
const idNum = Number(key);
const gov = isObj(c.government) ? (c.government as Record<string, any>) : {};
let ethics: string[] = [];
if (isObj(c.ethos)) for (const e of toArr(c.ethos.ethic)) if (typeof e === "string") ethics.push(e);
if (ethics.length === 0) {
  const founderRef = typeof c.founder_species_ref === "number" ? c.founder_species_ref : null;
  ethics = speciesEthicsFor(idNum, founderRef);
}
const perks = toArr(c.ascension_perks).filter((x): x is string => typeof x === "string");
const literal = isObj(c.name) && (c.name.literal === "yes" || c.name.literal === true);
const rawKey = isObj(c.name) ? (typeof c.name.key === "string" ? c.name.key : null) : null;
```
`designFromSav.ts`'s `extractDesignFromCountry(root, countryId)` should follow this exact idiom per RESEARCH.md's Pattern 3 field table (`04-RESEARCH.md` lines 384-409): typed `isObj`/`toArr` guards, explicit fallback chains (e.g. `planet_class` validity check per Pitfall 5, ruler `design`-snapshot-vs-synthesize branch per Pattern 4), never a bare `as` cast without a runtime check.

**Founder-species / pop-group fallback to generalize** (`savLoad.ts` lines 125-141, the `speciesEthicsFor` closure) — RESEARCH.md explicitly calls out reusing/generalizing this same fallback for resolving a full `species_db` entry when `founder_species_ref` is absent, not just ethic strings.

**Import shape** — pull the raw-subtree accessors added to `savLoad.ts` above:
```typescript
import type { RawEmpire } from "./gates"; // same style as savLoad.ts's own import
```

---

### `app/src/lib/empire/designSerialize.ts` (NEW)

**No direct codebase analog.** The app has no existing from-scratch Clausewitz *writer* (only readers/parsers). Do not adapt `jomini`'s `Writer` class (RESEARCH.md Pitfall 3 — its 2-space/single-line output is cosmetically wrong). Use RESEARCH.md's Code Examples section (`04-RESEARCH.md` lines 587-698, "A complete real design entry") as the ground-truth template for tab-indented, one-value-per-line output, and Pattern 2's `LocName` shapes for the recurring name/adjective/species_name fields (built on `designSchema.ts` above, not reimplemented locally).

**Weak structural analog for "build text via string concatenation, not templating":** `app/src/lib/export/mapImage.ts`'s canvas-drawing loop is the closest thing in the codebase to "assemble output field-by-field in a fixed order" — same discipline (explicit field order, explicit defaults) applies here even though the output format (text vs. canvas) differs.

---

### `app/src/lib/fsAccess.ts` (NEW)

**Analog for the download/fallback path:** `app/src/lib/export/mapImage.ts` lines 124-131 — this is the ONLY existing Blob-download code in the app; copy this idiom verbatim for the "no FS Access" fallback and for the pre-write backup:
```typescript
const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
if (!blob) throw new Error("PNG encoding failed");
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```
Extract this into a shared `downloadBlob(bytes: Uint8Array | Blob, filename: string): void` helper inside `fsAccess.ts` (or a sibling `lib/download.ts`) and have `mapImage.ts`, the designs-file download, the archive-file download, and the pre-write backup all call it — RESEARCH.md's "Don't Hand-Roll" table explicitly calls out this exact consolidation (3+ call sites in this phase alone).

**No codebase analog for the FS Access API portion** (`showOpenFilePicker`/`createWritable`/`queryPermission`) — this is genuinely new browser-API surface for the app. Use RESEARCH.md Pattern 5 verbatim (`04-RESEARCH.md` lines 444-477):
```typescript
const supportsFsAccess = "showOpenFilePicker" in self;

async function ensureReadWrite(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  if ((await (handle as any).queryPermission(opts)) === "granted") return true;
  return (await (handle as any).requestPermission(opts)) === "granted";
}

async function writeBackThenBackup(
  handle: FileSystemFileHandle,
  originalBytes: Uint8Array,
  newBytes: Uint8Array,
  originalFilename: string,
) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(originalBytes, `${originalFilename}.${stamp}.bak`);
  const writable = await handle.createWritable();
  await writable.write(newBytes);
  await writable.close();
}
```
**Error handling pattern to follow (feature-detect, never throw on unsupported):** matches `EmpirePanel.tsx`'s `import.meta.env.DEV &&` conditional-render idiom (line 140) — branch on capability, never assume; the UI-SPEC's "Failure (permission denied mid-write)" row requires catching the `requestPermission`/`createWritable` rejection and falling through to the download path automatically, mirroring `handleBytes`'s try/catch/finally shape in `EmpirePanel.tsx` (lines 52-71).

---

### `app/src/components/EmpireManagerPanel.tsx` (NEW)

**Analog 1 — dialog chrome (trigger button + `role="dialog"` + header/close):** `WhatsNew.tsx` lines 57-76:
```typescript
<button type="button" className="whats-new__chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
  What’s new in {diff.toVersion}
</button>
{open && (
  <div className="whats-new" role="dialog" aria-label="What changed in this patch">
    <header className="whats-new__header">
      <span>{diff.fromVersion} → {diff.toVersion}</span>
      <button type="button" onClick={() => setOpen(false)} aria-label="Close">✕</button>
    </header>
    <div className="whats-new__body">...</div>
  </div>
)}
```
UI-SPEC's Manager Dialog Layout explicitly says "structurally identical to `.whats-new`" — reuse this exact skeleton, renamed to `.empire-manager` classes, with the noted exception that closing must NOT discard staged state (no `setOpen(false)` clearing data — just a visibility boolean, staged state stays in a separate `useState`/store that persists across dialog close/reopen).

**Analog 2 — backdrop click-to-close + filter input + keyboard-navigable result list:** `FindOverlay.tsx`:
- Backdrop click-outside (lines 133-142):
```typescript
<div
  className="find-overlay"
  role="dialog"
  aria-label="Find a technology"
  onPointerDown={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
```
- Filter input (lines 144-155) — reuse `.find-box__input` class per UI-SPEC's Designs List & Filter row.
- Result row structure (lines 160-190) — reuse `.find-box__result` class per UI-SPEC ("Row layout... reuse its existing CSS by class reference"):
```typescript
<li
  className="find-box__result"
  data-area={t.area}
  data-active={i === activeIndex || undefined}
  onPointerEnter={() => setActiveIndex(i)}
  onClick={() => onPick(t.key)}
>
  {t.icon ? (
    <img className="find-box__icon" src={`${iconBase}/${t.icon}`} alt="" loading="lazy" />
  ) : (
    <span className="find-box__icon find-box__icon--empty" />
  )}
  <span className="find-box__name">{t.name}</span>
  <span className="find-box__meta">{categoryLabel(t.category)} · Tier {t.tier}</span>
</li>
```
The designs-list row (name + authority/species meta line + Remove/Undo action) follows this same row shape — swap the meta line content and add the trailing action button.

**Analog 3 — docked-panel-with-labeled-rows + icon chip w/ onError fallback:** `EmpireSettingsPanel`/`SettingsChip`, inline in `EmpirePanel.tsx` (lines 261-282, 285-362) — reuse `SettingsChip`'s icon-with-text-fallback pattern for the metadata icon row in the Designs List (UI-SPEC's "Metadata icon" row: `_<id>.webp`, `onError` fallback to text):
```typescript
function SettingsChip({ id, text, iconBase, iconOnly = false }: {...}) {
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = id !== null && !iconFailed;
  return (
    <span className="empire-chip" data-icon-only={iconOnly && showIcon ? "" : undefined} title={text}>
      {showIcon && (
        <img src={`${iconBase}/_${id}.webp`} alt={text} loading="lazy" onError={() => setIconFailed(true)} />
      )}
      {(!iconOnly || !showIcon) && text}
    </span>
  );
}
```

**Analog 4 — rendering save/design-derived names safely:** `PdxName`, inline in `EmpirePanel.tsx` (lines 241-256) — MUST reuse this exact component (or import it — consider promoting it out of `EmpirePanel.tsx` into `pdxText.ts` or a shared `components/PdxName.tsx` since both files need it now) for every design/empire name rendered in the dialog. RESEARCH.md's Security Domain section explicitly forbids `dangerouslySetInnerHTML` and mandates routing all such text through `parsePdxText`/`stripPdxCodes`:
```typescript
function PdxName({ raw }: { raw: string }) {
  const segments = parsePdxText(raw);
  return (
    <>
      {segments.map((s, i) =>
        s.color ? <span key={i} style={{ color: s.color }}>{s.text}</span> : s.text,
      )}
    </>
  );
}
```

**File-picker + drop-zone entry point:** `EmpirePanel.tsx` lines 120-137 (`.empire-drop`, drag-over/drop/click-to-open-file-input) — reuse verbatim for the primary upload zone and the collapsed archive-upload zone, with the addition (per D-02/UI-SPEC) of feature-detecting `showOpenFilePicker` inside the same click handler:
```typescript
<div
  className="empire-drop"
  onDragOver={(e) => e.preventDefault()}
  onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
  onClick={() => fileRef.current?.click()}
>
  Drop a <code>.sav</code> here or click to choose
  <input ref={fileRef} type="file" accept=".sav" hidden onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
</div>
```

---

### `app/src/components/EmpirePanel.tsx` (MODIFY)

**Analog:** itself. Two additions, both following existing in-file precedent:

1. **Entry-point button** ("Manage my empire designs") — copy the `showSettings` toggle button pattern verbatim (lines 184-193):
```typescript
<button
  type="button"
  className="empire-panel__settings-btn"
  aria-pressed={showSettings}
  onClick={() => setShowSettings((v) => !v)}
>
  {showSettings ? "Hide all settings" : "View all settings"}
</button>
```
Per UI-SPEC's App Shell Integration, this new button sits "directly below" this exact button, same `.empire-panel__settings-btn` class, `aria-pressed` gold-accent state.

2. **"Add to my empires" per-empire action** — lives directly under `.empire-identity` (lines 172-178):
```typescript
{selected && (
  <div className="empire-identity">
    {chip(selected.authority?.replace("auth_", "") ?? "?")}
    {selected.origin ? chip(selected.origin.replace("origin_", "")) : null}
    {selected.ethics.map((x) => chip(x.replace("ethic_", "")))}
  </div>
)}
```
Insert the new button immediately after this block, gated on `selected` the same way, using `selected.id` to key the pending-add stage action (per D-06/D-07, any `SavedEmpire` — player or AI — is addable, so no additional guard beyond `selected` truthiness is needed).

**Lazy-import pattern to reuse for the new manager panel's parser calls** (lines 56-58):
```typescript
const { loadEmpiresFromSav } = await import("../lib/empire/savLoad");
const { empires: emp, galaxy: gal } = await loadEmpiresFromSav(bytes);
```
`EmpireManagerPanel.tsx` should lazy-import `designsText.ts`/`designFromSav.ts`/`designSerialize.ts` the same way, inside the upload/save handlers — not as static top-level imports — per CLAUDE.md's bundle-size constraint (RESEARCH.md restates this explicitly for this phase).

---

### `app/src/styles/app.css` (MODIFY)

No new visual language — UI-SPEC mandates reusing these exact existing blocks by class name. Key excerpts already shipped:

**Dialog shell** (`.whats-new`, lines 94-110) — base for `.empire-manager`:
```css
.whats-new {
  position: fixed;
  top: 54px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--tree-panel);
  border: 1px solid var(--tree-border);
  border-radius: 8px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.6);
  color: var(--tree-text);
  font-family: var(--font-sans);
}
```
UI-SPEC's Manager Dialog Layout wants a centered `min(720px, 92vw)` backdrop variant instead — closer to `.find-overlay`/`.find-box` (lines 1879-1901):
```css
.find-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: rgba(0, 0, 0, 0.45);
}
.find-box {
  width: min(560px, 92vw);
  display: flex;
  flex-direction: column;
  background: var(--tree-panel);
  border: 1px solid var(--tree-border);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  font-family: var(--font-sans);
  color: var(--tree-text);
}
```

**Drop-zone** (`.empire-drop`, lines 2084-2098) — reuse verbatim, per UI-SPEC "visually and behaviorally identical to `.empire-drop`":
```css
.empire-drop {
  border: 1.5px dashed var(--tree-border);
  border-radius: 8px;
  padding: 14px 10px;
  text-align: center;
  font-size: 12px;
  color: color-mix(in srgb, var(--tree-text) 70%, transparent);
  cursor: pointer;
}
.empire-drop:hover { border-color: var(--color-select, #ffcf6b); }
.empire-drop code { color: var(--color-select, #ffcf6b); }
```

**Badge/chip** (`.empire-chip`, lines 2131-2157) — base for the new file-mode badge and "Added from save" badge:
```css
.empire-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--tree-border);
  color: color-mix(in srgb, var(--tree-text) 75%, transparent);
  white-space: nowrap;
}
```
Note UI-SPEC deliberately overrides padding to `4px 8px` (compliant 4px scale) for THIS phase's new badges — don't copy the pre-existing chip's sub-4px value.

**Primary CTA precedent** (`.overlay__retry-button`, lines 1846-1857) — the ONLY existing filled-primary-button in the app; UI-SPEC's "Save changes" button reuses this exact color contract:
```css
.overlay__retry-button {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-accent);
  color: var(--color-surface);
  border: none;
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-heading);
  cursor: pointer;
}
```

**Mobile bottom-sheet convention** (`.empire-settings` `@media (max-width: 640px)`, lines 2331-2340) — UI-SPEC explicitly says "do not invent a different mobile pattern," reuse this:
```css
@media (max-width: 640px) {
  .empire-settings {
    right: 8px;
    left: 8px;
    top: auto;
    bottom: 8px;
    width: auto;
    max-height: 55vh;
  }
}
```

**Color tokens already defined and ready to use (`app/src/styles/tokens.css`, no new tokens needed):**
```css
--color-accent: #2563eb;   /* Save changes button fill */
--color-danger: #b91c1c;   /* Remove-hover, error text */
--color-good: #57c96a;     /* success banner, in-place-saving badge dot */
--color-select: #ffd23f;   /* gold — hover/focus/active/duplicate-notice */
--tree-panel: #1a2130;     /* dialog/row background */
--tree-bg: #10141c;        /* backdrop / pending-changes summary strip */
--tree-border: #38445c;
--tree-text: #dbe2ee;
```

---

### `app/src/test/designsText.test.ts` / `app/src/test/designFromSav.test.ts` (NEW)

**Analog:** `app/src/test/empire-classify.test.ts` — fixture-object-driven `describe`/`it` blocks, vitest imports:
```typescript
import { describe, it, expect } from "vitest";
import { buildEmpireState, classifyGate, type GateNode } from "../lib/empire/gates";
import { classifyAll, type TechLite } from "../lib/empire/classify";

const machine = buildEmpireState({
  authority: "auth_machine_intelligence",
  ethics: ["ethic_gestalt_consciousness"],
  civics: [],
  origin: "origin_machine_o",
  researched: [],
});
```
Follow this exact shape for `designFromSav.test.ts`: build small literal `country`/`species_db`/`leaders` fixture objects (matching RESEARCH.md's Pattern 3/4 field tables) rather than depending on the user's real save file (which lives outside the repo per CLAUDE.md's data-source constraint and is not a committed fixture).

**Real-file fixture-loading pattern (if a sanitized sample designs file is added as a test fixture):** `app/src/test/smoke.test.ts` lines 1-20:
```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadRealSnapshot(): TechSnapshot {
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}
```
Use this only if a fixture `.txt` (small, hand-authored — NOT the user's real 400KB file, which stays local per CLAUDE.md) is checked into a test-fixtures directory; otherwise inline string fixtures (small hand-written designs-file snippets covering the field shapes in RESEARCH.md's Code Examples) are simpler and match the `empire-classify.test.ts` style better.

---

## Shared Patterns

### Lazy module loading (bundle-size discipline)
**Source:** `app/src/components/EmpirePanel.tsx` lines 56-58
**Apply to:** `EmpireManagerPanel.tsx`'s upload/save handlers — `designsText.ts`, `designFromSav.ts`, `designSerialize.ts`, and `fsAccess.ts` should all be dynamically `import()`ed inside event handlers, never statically imported at module top-level, so `jomini`/`fflate` stay out of the main bundle (CLAUDE.md pin + RESEARCH.md restates this explicitly for this phase).
```typescript
const { loadEmpiresFromSav } = await import("../lib/empire/savLoad");
```

### `isObj`/`toArr` guards for untyped jomini output
**Source:** `app/src/lib/empire/savLoad.ts` lines 60-65
**Apply to:** `designFromSav.ts`, any code reading `jomini.parseText` output for the designs file in `designsText.ts`'s validation step.
```typescript
function toArr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```

### Paradox color-code-safe name rendering
**Source:** `app/src/lib/pdxText.ts` (whole file) + `PdxName` component in `EmpirePanel.tsx` (lines 241-256)
**Apply to:** Every design/empire name shown in `EmpireManagerPanel.tsx` (list rows, dialog title, duplicate-name notice, success banner). Never `dangerouslySetInnerHTML`; never strip codes before the D-09 duplicate-name comparison (compare raw strings, only strip for display) — RESEARCH.md's Security Domain / Anti-Patterns sections both flag this.

### Blob-download helper
**Source:** `app/src/lib/export/mapImage.ts` lines 124-131
**Apply to:** `fsAccess.ts`'s fallback path, the pre-write backup, and the archive-file download — extract into one shared function, call it from all these sites (RESEARCH.md's Don't Hand-Roll table).

### Error throw/catch contract
**Source:** `app/src/lib/empire/savLoad.ts` line 74 (`throw new Error("...")`), consumed by `EmpirePanel.tsx` lines 64-65 (`e instanceof Error ? e.message : String(e)`)
**Apply to:** `designsText.ts`'s span scanner and `designFromSav.ts`'s extraction — throw plain `Error` with a user-facing message on malformed/unreconcilable input (never guess), let the calling component's existing try/catch/`setError` pattern surface it.

### Feature-detect, never require (progressive enhancement)
**Source:** `app/src/components/EmpirePanel.tsx` line 140 (`import.meta.env.DEV && (...)`)
**Apply to:** `fsAccess.ts`'s `"showOpenFilePicker" in self` check and every call site that branches on it — same "conditionally render/execute, no dead-end UI state" discipline.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `app/src/lib/empire/designSerialize.ts` | utility (serializer) | transform | No existing from-scratch Clausewitz *writer* exists in the codebase (only readers). Use RESEARCH.md's Code Examples section (the real sampled entry, `04-RESEARCH.md` lines 587-698) as the template instead of a codebase analog. |
| `app/src/lib/fsAccess.ts` (FS Access API portion only — `showOpenFilePicker`/`createWritable`/`queryPermission`) | utility (browser I/O) | file-I/O | No existing code in the app touches the File System Access API — it's genuinely new browser-API surface for this phase. Use RESEARCH.md Pattern 5 verbatim (`04-RESEARCH.md` lines 444-477). The Blob/download half of this same file DOES have an analog (`mapImage.ts`, see above). |

---

## Metadata

**Analog search scope:** `app/src/lib/empire/`, `app/src/lib/export/`, `app/src/lib/pdxText.ts`, `app/src/components/`, `app/src/styles/`, `app/src/test/`
**Files scanned:** `savLoad.ts`, `EmpirePanel.tsx`, `pdxText.ts`, `mapImage.ts`, `gates.ts`, `classifyEmpire.ts`, `WhatsNew.tsx`, `FindOverlay.tsx`, `App.tsx`, `app.css`, `tokens.css`, `empire-classify.test.ts`, `smoke.test.ts` (13 files read; `draw.test.ts`/`archetype.test.ts` line-counted only, not needed beyond confirming test-file naming convention)
**Pattern extraction date:** 2026-08-18
