/**
 * Browser file I/O: the shared Blob-download helper (D-01 baseline, used by
 * the designs file, the archive file, the pre-write backup, and
 * `export/mapImage.ts`) and a File System Access API wrapper that makes
 * D-02's "backup before any in-place write" a property of a function
 * signature rather than a convention a caller could forget.
 *
 * TS 5.9's lib.dom.d.ts declares FileSystemFileHandle/FileSystemHandle/
 * FileSystemWritableFileStream and createWritable() directly (verified
 * against app/node_modules/typescript/lib/lib.dom.d.ts), but does NOT
 * declare `showOpenFilePicker` on the global object, nor
 * `queryPermission`/`requestPermission` on FileSystemHandle. Those are
 * narrowed locally below through one generic cast helper (see `cast<T>`)
 * instead of sprinkling unsafe casts at each call site.
 */

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandlePermissions {
  queryPermission(descriptor: { mode: FileSystemPermissionMode }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: FileSystemPermissionMode }): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
}

type ShowOpenFilePicker = (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;

/**
 * Single narrowing cast site for browser-API surface TS 5.9's lib.dom does
 * not yet declare (see file header). Parameterized over `unknown` so every
 * call site gets a precisely-typed result without repeating this cast.
 */
function cast<T>(value: unknown): T {
  return value as any;
}

/**
 * Shared Blob-download helper — the D-01 baseline path with three call
 * sites in this phase (designs file, archive file, pre-write backup) plus
 * `export/mapImage.ts`. Lifted verbatim from mapImage.ts's prior inline
 * anchor-click block.
 */
export function downloadBlob(
  data: Uint8Array | Blob,
  filename: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Feature-detected at call time (not module load) so it is trivially
 * stubbable in tests. Per D-02, absence is never treated as an error state.
 */
export function supportsFsAccess(): boolean {
  // `globalThis`, not `self` — `self` is browser/worker-only and is
  // undefined in this package's `node` vitest environment, which would
  // throw a ReferenceError instead of returning false as required.
  return "showOpenFilePicker" in globalThis;
}

/**
 * Returns null immediately when the File System Access API is unsupported.
 * A user cancelling the picker throws `AbortError` — that specific case is
 * swallowed and treated as null (cancelling is not an error the UI should
 * surface); anything else is rethrown as a plain `Error`, matching
 * savLoad.ts's throw/catch contract.
 */
export async function pickTextFileHandle(): Promise<FileSystemFileHandle | null> {
  if (!supportsFsAccess()) return null;
  try {
    const { showOpenFilePicker } = cast<{ showOpenFilePicker: ShowOpenFilePicker }>(globalThis);
    const handles = await showOpenFilePicker({
      types: [{ description: "Stellaris empire designs", accept: { "text/plain": [".txt"] } }],
      multiple: false,
    });
    return handles[0] ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Never throws for a denial — returns false so the caller can fall back to
 * the download path (UI-SPEC "Failure (permission denied mid-write)"
 * requires an automatic fallback, never a stuck state).
 */
export async function ensureReadWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const permissions = cast<FileSystemHandlePermissions>(handle);
  const opts = { mode: "readwrite" as const };
  try {
    if ((await permissions.queryPermission(opts)) === "granted") return true;
    return (await permissions.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

/**
 * Pure and deterministic for a given date — colons and dots inside the ISO
 * stamp are replaced with `-`, the original filename (including its own
 * dots) is left untouched, and a `.bak` suffix is appended.
 */
export function backupFilename(originalFilename: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return `${originalFilename}.${stamp}.bak`;
}

/**
 * The D-02 safety ordering encoded in one function so no caller can skip
 * it: (1) download the original bytes as a timestamped backup FIRST and
 * unconditionally, (2) only then open a writable stream and commit the new
 * bytes. Steps 1 and 2 must not be reordered — writes made via
 * `createWritable()` are invisible until `close()`, so the backup is
 * guaranteed to have already fired by the time the real file changes.
 * `originalBytes` must be the bytes as read, not a re-encode. There is
 * deliberately no parameter that lets a caller disable the backup.
 */
export async function saveInPlaceWithBackup(
  handle: FileSystemFileHandle,
  originalBytes: Uint8Array,
  newBytes: Uint8Array,
  originalFilename: string,
  at?: Date,
): Promise<{ backupName: string }> {
  const backupName = backupFilename(originalFilename, at ?? new Date());
  downloadBlob(originalBytes, backupName);

  const writable = await handle.createWritable();
  await writable.write(newBytes as BufferSource);
  await writable.close();

  return { backupName };
}
