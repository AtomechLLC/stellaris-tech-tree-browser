/**
 * Empire Manager session state (04-05, extended 04-06, extended 04-07). Owns
 * the loaded designs/archive files, the optional in-place-write handle,
 * every staged add/remove, the `save()` action that turns staged changes
 * into the two output files, and — as of 04-07 — `stageAddFromEmpire`, which
 * converts any `SavedEmpire` from a loaded `.sav` into a staged design
 * (D-06/D-07/D-09). Deliberately lifted to a hook mounted in `EmpirePanel`
 * (not the dialog itself) so this state survives the manager dialog being
 * closed and reopened (UI-SPEC Dialog Close Behavior: closing must never
 * discard staged work).
 *
 * Parser access (`parseDesignsFile`/`uniqueDesignName`, from `./designsText`)
 * is ALWAYS via a dynamic `await import(...)` inside an action, never a
 * static top-level import, so jomini stays out of the main bundle (CLAUDE.md
 * bundle constraint / RESEARCH.md); `serializeDesignEntry` (from
 * `./designSerialize`) follows the same dynamic-import convention even
 * though that module has no jomini dependency, for consistency and because
 * it is only ever needed inside the same lazy action. `DesignsFile` is
 * referenced here only as an inline type query
 * (`import("./designsText").DesignsFile`), which TS erases entirely at
 * compile time — there is no runtime import of `./designsText` anywhere in
 * this module outside the lazy-loaded handlers.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { downloadBlob, ensureReadWritePermission, pickTextFileHandle, saveInPlaceWithBackup } from "../fsAccess";
import type { SavedEmpire } from "./savLoad";
import type { DesignEntry } from "./designSchema";

type DesignsFile = import("./designsText").DesignsFile;

const DEFAULT_ARCHIVE_FILENAME = "user_empire_designs_archive.txt";

/**
 * Pure core of the save flow (D-08/D-05): derives the two output texts from
 * the currently-loaded files plus staged changes, via the SAME
 * `spliceDesignsFile` engine for both the designs file and the archive file
 * so kept/previously-archived entries are never re-serialized (D-08,
 * RESEARCH Pitfall 6). Exported at module scope (not inside the hook) so it
 * is directly unit-testable in the node vitest environment.
 */
export function buildDesignsOutputs(
  designs: DesignsFile,
  archive: DesignsFile | null,
  removed: ReadonlySet<number>,
  adds: readonly StagedAdd[],
  spliceDesignsFile: (file: DesignsFile, removedIndices: ReadonlySet<number>, addedTexts: readonly string[]) => string,
): { designsText: string; archiveText: string | null; addedCount: number; removedCount: number } {
  const addedCount = adds.length;
  const removedCount = removed.size;

  const designsText = spliceDesignsFile(
    designs,
    removed,
    adds.map((a) => a.text),
  );

  let archiveText: string | null = null;
  if (removedCount > 0) {
    const removedTexts = designs.entries
      .map((entry, i) => ({ entry, i }))
      .filter(({ i }) => removed.has(i))
      .map(({ entry }) => designs.text.slice(entry.start, entry.end));

    const archiveTarget: DesignsFile =
      archive ??
      ({
        filename: DEFAULT_ARCHIVE_FILENAME,
        text: "",
        separator: designs.separator,
        encoding: designs.encoding,
        entries: [],
        warning: null,
      } satisfies DesignsFile);

    archiveText = spliceDesignsFile(archiveTarget, new Set(), removedTexts);
  }

  return { designsText, archiveText, addedCount, removedCount };
}

/**
 * D-09 name resolution for staging an "add from save" — the single exported
 * pure function through which the disambiguation decision flows. Deliberately
 * does NOT construct the numbered-suffix text itself: it delegates entirely
 * to `uniqueDesignName` (`designsText.ts`), passed in as `uniqueName`, so
 * that construction exists in exactly one source file across this directory
 * — `designsText.ts`, never duplicated here. `uniqueName` is a parameter —
 * not a static import — because `designsText.ts` pulls in `jomini`, and this
 * module's own invariant (see header doc) is zero static references to that
 * module outside its lazy-loaded handlers; `stageAddFromEmpire` supplies the
 * real `uniqueDesignName` from its existing dynamic `await
 * import("./designsText")`, and tests supply it directly (test bundles are
 * never shipped).
 */
export function resolveStagedName(
  desiredKey: string,
  taken: readonly string[],
  uniqueName: (desired: string, taken: Iterable<string>) => string,
): string {
  return uniqueName(desiredKey, taken);
}

/** A staged "add from save" entry. `text` is the already-serialized entry
 *  body (`designSerialize.ts`'s output); `rawName` is the possibly
 *  D-09-disambiguated name actually used for the new top-level key.
 *  Populated by `stageAddFromEmpire`, which replaces (rather than
 *  duplicates) a prior staged add for the same `sourceEmpireId`; `stageAdd`
 *  remains the lower-level append-only setter for direct construction
 *  (e.g. tests). */
export interface StagedAdd {
  id: string;
  rawName: string;
  originalName: string;
  text: string;
  sourceEmpireId: number;
}

/** Result of the most recent successful `save()`, rendered by the dialog as
 *  the success banner (Copywriting Contract: "Saved — {A} added, {R}
 *  archived." plus, when a backup was made, the backup-filename sentence). */
export interface LastSave {
  added: number;
  removed: number;
  backupName: string | null;
}

/** Result of `stageAddFromEmpire` — what the panel action (04-07 Task 2)
 *  needs to decide what to render: open the manager dialog (`needsFile`),
 *  show the collision notice (`renamedFrom` set), or neither. */
export interface StageAddResult {
  staged: boolean;
  needsFile: boolean;
  rawName: string | null;
  renamedFrom: string | null;
}

export interface DesignsSession {
  designs: DesignsFile | null;
  archive: DesignsFile | null;
  handle: FileSystemFileHandle | null;
  canWriteInPlace: boolean;
  loading: boolean;
  error: string | null;
  warning: string | null;
  removed: ReadonlySet<number>;
  adds: StagedAdd[];
  /** `adds.length + removed.size`. */
  pendingCount: number;
  /** Raw names currently "in" the file: kept (non-removed) entries plus
   *  staged adds — for 04-07's D-09 duplicate-name check. */
  takenNames: string[];
  /** Result of the most recent successful save, or null before any save /
   *  after `clearLastSave()`. */
  lastSave: LastSave | null;
  loadDesignsFile: (file: File) => Promise<void>;
  loadDesignsViaPicker: () => Promise<void>;
  loadArchiveFile: (file: File) => Promise<void>;
  toggleRemove: (index: number) => void;
  stageAdd: (add: StagedAdd) => void;
  /** D-06/D-07/D-09: converts any `SavedEmpire` (player or AI) into a staged,
   *  correctly-named, serialized design entry. See module doc + `StageAddResult`. */
  stageAddFromEmpire: (empire: SavedEmpire) => Promise<StageAddResult>;
  undoAdd: (id: string) => void;
  discard: () => void;
  clearError: () => void;
  /** No-op when `pendingCount === 0`. Splices staged changes into the two
   *  output files, writes/downloads them, and re-baselines the session so a
   *  second save in the same session stays byte-safe. See module doc. */
  save: () => Promise<void>;
  clearLastSave: () => void;
}

export function useDesignsSession(): DesignsSession {
  const [designs, setDesigns] = useState<DesignsFile | null>(null);
  // The exact bytes as read for the currently-loaded designs file — the
  // pre-write backup uses THIS, never a re-encode of `designs.text`, because
  // a file that fell back to the windows-1252 decode path would not
  // re-encode to the same bytes (see designsText.ts's decodeDesignsBytes doc).
  const [designsOriginalBytes, setDesignsOriginalBytes] = useState<Uint8Array | null>(null);
  const [archive, setArchive] = useState<DesignsFile | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [canWriteInPlace, setCanWriteInPlace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [adds, setAdds] = useState<StagedAdd[]>([]);
  const [lastSave, setLastSave] = useState<LastSave | null>(null);
  // Fallback id source when crypto.randomUUID is unavailable — a counter is
  // sufficient for identity within one session (ids are never persisted).
  const addIdCounter = useRef(0);

  const loadDesignsFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { parseDesignsFile } = await import("./designsText");
      const parsed = await parseDesignsFile(bytes, file.name);
      setDesigns(parsed);
      setDesignsOriginalBytes(bytes);
      setRemoved(new Set());
      setAdds([]);
      setWarning(parsed.warning);
      setLastSave(null);
    } catch (e) {
      // Leave the previously loaded file (if any) untouched on failure.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDesignsViaPicker = useCallback(async () => {
    // Null = unsupported or user cancelled — a silent no-op, never an error
    // (D-02: never let an unsupported browser reach a dead end).
    const picked = await pickTextFileHandle();
    if (!picked) return;
    setLoading(true);
    setError(null);
    try {
      const file = await picked.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { parseDesignsFile } = await import("./designsText");
      const parsed = await parseDesignsFile(bytes, file.name);
      setDesigns(parsed);
      setDesignsOriginalBytes(bytes);
      setRemoved(new Set());
      setAdds([]);
      setWarning(parsed.warning);
      setLastSave(null);
      setHandle(picked);
      setCanWriteInPlace(await ensureReadWritePermission(picked));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadArchiveFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // D-08: "same rule for the uploaded archive file" — identical parse path.
      const { parseDesignsFile } = await import("./designsText");
      const parsed = await parseDesignsFile(bytes, file.name);
      setArchive(parsed);
    } catch (e) {
      // Surfaces its own parse error without discarding the loaded designs file.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleRemove = useCallback((index: number) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const stageAdd = useCallback((add: StagedAdd) => {
    setAdds((prev) => [...prev, add]);
  }, []);

  const stageAddFromEmpire = useCallback(
    async (empire: SavedEmpire): Promise<StageAddResult> => {
      // No file loaded — there's nowhere to stage into. The caller (the
      // panel action) opens the manager dialog; nothing is staged here
      // (T-04-27 / UI-SPEC: never a silent no-op).
      if (!designs) {
        return { staged: false, needsFile: true, rawName: null, renamedFrom: null };
      }
      // Empire couldn't be converted to a design payload (too degenerate a
      // country) — a user-facing error, never a throw.
      if (!empire.design) {
        setError("This empire's data is too incomplete to convert into a design.");
        return { staged: false, needsFile: false, rawName: null, renamedFrom: null };
      }

      const designPayload: DesignEntry = empire.design;
      // D-09 collision resolution MUST run on the SANITIZED key, because that
      // is what `serializeDesignEntry` actually writes as the top-level key.
      // Resolving the raw key would let a save-derived name like
      // `Alarian"Consciousness` pass the uniqueness check against an existing
      // `AlarianConsciousness` entry and then serialize into a duplicate — the
      // exact outcome D-09 exists to prevent — while also desynchronizing
      // `rawName`/`takenNames` from the bytes on disk (review WR-02).
      const { sanitizeDesignKey, serializeDesignEntry } = await import("./designSerialize");
      const desiredKey = sanitizeDesignKey(designPayload.key);

      // Resolve against everything currently "in" the file EXCEPT this same
      // empire's own prior staged add (if any) — re-staging the same source
      // empire replaces it rather than compounding the " (N)" suffix on
      // every re-stage.
      const kept = designs.entries.filter((_, i) => !removed.has(i)).map((e) => e.rawName);
      const otherAdds = adds.filter((a) => a.sourceEmpireId !== empire.id).map((a) => a.rawName);
      const takenForResolution = [...kept, ...otherAdds];

      const { uniqueDesignName } = await import("./designsText");
      const resolvedName = resolveStagedName(desiredKey, takenForResolution, uniqueDesignName);
      const renamedFrom = resolvedName !== desiredKey ? desiredKey : null;

      const text = serializeDesignEntry({ ...designPayload, key: resolvedName }, designs.separator);

      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `add-${addIdCounter.current++}`;

      const newAdd: StagedAdd = {
        id,
        rawName: resolvedName,
        originalName: desiredKey,
        text,
        sourceEmpireId: empire.id,
      };

      setAdds((prev) => [...prev.filter((a) => a.sourceEmpireId !== empire.id), newAdd]);

      return { staged: true, needsFile: false, rawName: resolvedName, renamedFrom };
    },
    [designs, removed, adds],
  );

  const undoAdd = useCallback((id: string) => {
    setAdds((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Clears only staged removals/adds — never the loaded file or the handle.
  const discard = useCallback(() => {
    setRemoved(new Set());
    setAdds([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearLastSave = useCallback(() => {
    setLastSave(null);
  }, []);

  const save = useCallback(async () => {
    if (adds.length === 0 && removed.size === 0) return; // no-op: nothing staged
    if (!designs || !designsOriginalBytes) return; // nothing loaded to save

    // Everything below is wrapped: a chunk-load failure, a download failure or
    // a post-write re-parse failure must surface as a user-visible error, never
    // as a swallowed unhandled rejection (callers use `void save()`) and never
    // as a silently stale baseline that reverts this save on the next one
    // (review WR-01).
    let wroteDesigns = false;
    try {
      const { spliceDesignsFile, encodeDesignsText, parseDesignsFile } = await import("./designsText");
      const { designsText, archiveText, addedCount, removedCount } = buildDesignsOutputs(
        designs,
        archive,
        removed,
        adds,
        spliceDesignsFile,
      );
      const designsBytes = encodeDesignsText(designsText);

      let backupName: string | null = null;
      let wroteInPlace = false;
      if (handle) {
        // Permission is not guaranteed to persist between load and save — re-check.
        let permitted = false;
        try {
          permitted = await ensureReadWritePermission(handle);
        } catch {
          permitted = false;
        }
        if (permitted) {
          try {
            const result = await saveInPlaceWithBackup(handle, designsOriginalBytes, designsBytes, designs.filename);
            backupName = result.backupName;
            wroteInPlace = true;
          } catch {
            setError(
              "Couldn't save directly — permission was denied. Downloading your files instead; replace the originals manually.",
            );
          }
        } else {
          setError(
            "Couldn't save directly — permission was denied. Downloading your files instead; replace the originals manually.",
          );
        }
      }
      if (!wroteInPlace) {
        // Always the SAME filename the user uploaded — never reconstructed or
        // version-suffixed (D-03).
        downloadBlob(designsBytes, designs.filename);
      }
      wroteDesigns = true;

      // The archive is always a download, even in the in-place path — D-02
      // scopes File System Access write-back to the primary designs file only.
      const archiveFilename = archive?.filename ?? DEFAULT_ARCHIVE_FILENAME;
      let archiveBytes: Uint8Array | null = null;
      if (archiveText !== null) {
        archiveBytes = encodeDesignsText(archiveText);
        downloadBlob(archiveBytes, archiveFilename);
      }

      // Re-baseline: the emitted bytes become the new "original" bytes, and we
      // re-parse them so stored spans reflect the new file — otherwise a
      // second save in the same session would splice from stale offsets.
      const reparsed = await parseDesignsFile(designsBytes, designs.filename);
      setDesigns(reparsed);
      setDesignsOriginalBytes(designsBytes);

      // The ARCHIVE needs the same treatment (review CR-02). Without it, a
      // second removal in the same session builds archive #2 from the stale
      // uploaded archive, so the first save's archived entry is missing from
      // the file the user is told to keep — while that design has already been
      // removed from the designs file. That is silent data loss through the
      // sanctioned workflow, and it breaks D-05 ("a remove always produces the
      // corresponding archive entry").
      if (archiveBytes !== null) {
        setArchive(await parseDesignsFile(archiveBytes, archiveFilename));
      }

      // Only now is it safe to drop the staged changes — they are on disk AND
      // both baselines match what was written.
      setLastSave({ added: addedCount, removed: removedCount, backupName });
      setRemoved(new Set());
      setAdds([]);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (wroteDesigns) {
        // The new file is already on disk but we could not re-establish a
        // trustworthy baseline. Keeping the old spans would make the NEXT save
        // splice from stale offsets and silently revert this one, so drop the
        // loaded file entirely and make the user re-open it.
        setDesigns(null);
        setDesignsOriginalBytes(null);
        setHandle(null);
        setCanWriteInPlace(false);
        setRemoved(new Set());
        setAdds([]);
        setLastSave(null);
        setError(
          `Your files were written, but the result couldn't be re-read (${detail}). Load your designs file again before making more changes.`,
        );
      } else {
        setError(`Couldn't save your changes (${detail}). Nothing was written — your staged changes are still here.`);
      }
    }
  }, [designs, designsOriginalBytes, archive, removed, adds, handle]);

  const takenNames = useMemo(() => {
    const kept = designs
      ? designs.entries.filter((_, i) => !removed.has(i)).map((e) => e.rawName)
      : [];
    return [...kept, ...adds.map((a) => a.rawName)];
  }, [designs, removed, adds]);

  return {
    designs,
    archive,
    handle,
    canWriteInPlace,
    loading,
    error,
    warning,
    removed,
    adds,
    pendingCount: adds.length + removed.size,
    takenNames,
    lastSave,
    loadDesignsFile,
    loadDesignsViaPicker,
    loadArchiveFile,
    toggleRemove,
    stageAdd,
    stageAddFromEmpire,
    undoAdd,
    discard,
    clearError,
    save,
    clearLastSave,
  };
}
