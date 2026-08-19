/**
 * Empire Manager session state (04-05). Owns the loaded designs/archive
 * files, the optional in-place-write handle, and every staged add/remove —
 * deliberately lifted to a hook mounted in `EmpirePanel` (not the dialog
 * itself) so this state survives the manager dialog being closed and
 * reopened (UI-SPEC Dialog Close Behavior: closing must never discard
 * staged work).
 *
 * Parser access (`parseDesignsFile`, from `./designsText`) is ALWAYS via a
 * dynamic `await import(...)` inside an action, never a static top-level
 * import, so jomini stays out of the main bundle (CLAUDE.md bundle
 * constraint / RESEARCH.md). `DesignsFile` is referenced here only as an
 * inline type query (`import("./designsText").DesignsFile`), which TS
 * erases entirely at compile time — there is no runtime import of
 * `./designsText` anywhere in this module outside the lazy-loaded handlers.
 *
 * `save()` is NOT part of this plan — 04-06 adds the splice + write-back
 * action on top of this session's `designs`/`archive`/`removed`/`adds`
 * state.
 */
import { useCallback, useMemo, useState } from "react";
import { ensureReadWritePermission, pickTextFileHandle } from "../fsAccess";

type DesignsFile = import("./designsText").DesignsFile;

/** A staged "add from save" entry. `text` is the already-serialized entry
 *  body (04-07's `designSerialize.ts` output); `rawName` is the possibly
 *  D-09-disambiguated name actually used for the new top-level key. This
 *  plan only stores and counts these — 04-07 is what populates them via
 *  `stageAdd`. */
export interface StagedAdd {
  id: string;
  rawName: string;
  originalName: string;
  text: string;
  sourceEmpireId: number;
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
  loadDesignsFile: (file: File) => Promise<void>;
  loadDesignsViaPicker: () => Promise<void>;
  loadArchiveFile: (file: File) => Promise<void>;
  toggleRemove: (index: number) => void;
  stageAdd: (add: StagedAdd) => void;
  undoAdd: (id: string) => void;
  discard: () => void;
  clearError: () => void;
}

export function useDesignsSession(): DesignsSession {
  const [designs, setDesigns] = useState<DesignsFile | null>(null);
  const [archive, setArchive] = useState<DesignsFile | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [canWriteInPlace, setCanWriteInPlace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [adds, setAdds] = useState<StagedAdd[]>([]);

  const loadDesignsFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { parseDesignsFile } = await import("./designsText");
      const parsed = await parseDesignsFile(bytes, file.name);
      setDesigns(parsed);
      setRemoved(new Set());
      setAdds([]);
      setWarning(parsed.warning);
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
      setRemoved(new Set());
      setAdds([]);
      setWarning(parsed.warning);
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
    loadDesignsFile,
    loadDesignsViaPicker,
    loadArchiveFile,
    toggleRemove,
    stageAdd,
    undoAdd,
    discard,
    clearError,
  };
}
