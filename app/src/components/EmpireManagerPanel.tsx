import { useRef, useState } from "react";
import type { DesignsSession } from "../lib/empire/useDesignsSession";
import { supportsFsAccess } from "../lib/fsAccess";
import { PdxName } from "./PdxName";

/**
 * Empire Designs manager dialog (04-05, extended 04-06 with the save/
 * discard/replace confirmation flow and result banners). Adding empires from
 * a loaded save is 04-07. This component never imports a parser module
 * statically — every parse call goes through `session`'s actions, which
 * lazy-load `designsText.ts` themselves.
 */

/** Inline confirmation state — replaces the footer's action row (save,
 *  discard) or sits under the upload section (replace), never a nested
 *  modal-on-modal (app's no-nested-dialogs convention). */
type Confirm = null | "save" | "discard" | { kind: "replace"; file: File | null; viaPicker: boolean };

/** Strips a known id prefix, unslugs, and Title-Cases a raw Stellaris id
 *  (e.g. `auth_hive_mind` → "Hive Mind"). Mirrors `EmpirePanel.tsx`'s
 *  `humanize` helper — kept local here since this component has no other
 *  reason to import from `EmpirePanel.tsx`. */
function humanize(id: string): string {
  return id
    .replace(/^(auth_|origin_|ethic_|civic_|ap_|sp_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** 16px metadata icon before a design row's authority text — same
 *  icon-with-`onError`-fallback idiom as `EmpirePanel.tsx`'s `SettingsChip`.
 *  On a 404 the icon simply disappears (the row's meta line already carries
 *  the humanized authority text, so no information is lost). */
function RowIcon({ authority, iconBase }: { authority: string | null; iconBase: string }) {
  const [failed, setFailed] = useState(false);
  const showIcon = authority !== null && !failed;
  return (
    <span className="empire-manager__row-icon">
      {showIcon && (
        <img
          src={`${iconBase}/_${authority}.webp`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

interface LoadedFileRowProps {
  filename: string;
  badge?: { label: string; variant: "good" | "neutral" } | null;
  onChangeFile: () => void;
  disabled: boolean;
}

/** Compact "loaded file" row: monospace filename + optional file-mode badge
 *  + a "change file" text button. Shared by the primary upload and the
 *  optional archive upload (the archive variant omits the badge). */
function LoadedFileRow({ filename, badge, onChangeFile, disabled }: LoadedFileRowProps) {
  return (
    <div className="empire-manager__loaded-row">
      <span className="empire-manager__filename">{filename}</span>
      {badge && (
        <span className="empire-manager__badge" data-variant={badge.variant}>
          {badge.label}
        </span>
      )}
      <button type="button" className="empire-manager__change-file" onClick={onChangeFile} disabled={disabled}>
        change file
      </button>
    </div>
  );
}

export function EmpireManagerPanel({
  session,
  iconBase,
  onClose,
}: {
  session: DesignsSession;
  iconBase: string;
  onClose: () => void;
}) {
  const [showArchive, setShowArchive] = useState(false);
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const designsInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  // Closing the dialog is one of the two triggers that clears a lingering
  // success banner (the other is staging a new change — see toggleRemove
  // below). Staged adds/removes are NOT cleared here (Dialog Close Behavior).
  const closeDialog = () => {
    session.clearLastSave();
    onClose();
  };

  const openDesignsPicker = () => {
    // Replacing the loaded designs file resets staged adds/removes
    // (loadDesignsFile/loadDesignsViaPicker both clear them) — confirm first
    // whenever anything is staged (UI-SPEC replace-file confirmation).
    if (session.pendingCount > 0) {
      setConfirm({ kind: "replace", file: null, viaPicker: supportsFsAccess() });
      return;
    }
    if (supportsFsAccess()) {
      void session.loadDesignsViaPicker();
    } else {
      designsInputRef.current?.click();
    }
  };

  const onReplaceConfirm = async () => {
    if (!confirm || confirm === "save" || confirm === "discard") return;
    const target = confirm;
    setConfirm(null);
    if (target.file) {
      await session.loadDesignsFile(target.file);
    } else if (target.viaPicker) {
      await session.loadDesignsViaPicker();
    } else {
      designsInputRef.current?.click();
    }
  };

  const onDesignsFile = (f: File | undefined) => {
    if (f) void session.loadDesignsFile(f);
  };
  const onArchiveFile = (f: File | undefined) => {
    if (f) void session.loadArchiveFile(f);
  };

  const onToggleRemove = (index: number) => {
    session.clearLastSave();
    session.toggleRemove(index);
  };

  const onSaveClick = () => {
    // Any removal or an in-place write is confirmed first (destructive-
    // confirmation copy); an adds-only download-path save needs no prompt.
    if (session.removed.size > 0 || session.canWriteInPlace) {
      setConfirm("save");
    } else {
      void session.save();
    }
  };

  const onDiscardClick = () => {
    // Discarding staged removals is confirmed; adds-only discards are not
    // (nothing external is affected).
    if (session.removed.size > 0) {
      setConfirm("discard");
    } else {
      session.discard();
    }
  };

  const entries = session.designs?.entries ?? [];
  const filteredIndexed = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.displayName.toLowerCase().includes(filter.toLowerCase()));

  const addedCount = session.adds.length;
  const removedCount = session.removed.size;
  const pendingLabel = `${session.pendingCount} pending change${session.pendingCount === 1 ? "" : "s"}`;

  return (
    <div
      className="empire-manager__backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      <div className="empire-manager" role="dialog" aria-label="Empire Designs">
        <header className="empire-manager__header">
          <div className="empire-manager__header-titles">
            <span className="empire-manager__title">Empire Designs</span>
            {session.designs && (
              <span className="empire-manager__filename">{session.designs.filename}</span>
            )}
          </div>
          <button type="button" className="empire-manager__close" onClick={closeDialog} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="empire-manager__body">
          {/* Section 1: primary upload / loaded-file state */}
          {!session.designs ? (
            <div
              className="empire-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDesignsFile(e.dataTransfer.files?.[0]);
              }}
              onClick={openDesignsPicker}
            >
              {session.loading ? (
                "Parsing…"
              ) : (
                <>
                  Drop your empire designs file here or click to choose
                  <br />
                  <code>user_empire_designs_v3.4.txt</code>
                </>
              )}
            </div>
          ) : (
            <LoadedFileRow
              filename={session.designs.filename}
              badge={
                session.canWriteInPlace
                  ? { label: "In-place saving enabled", variant: "good" }
                  : { label: "Download only", variant: "neutral" }
              }
              onChangeFile={openDesignsPicker}
              disabled={session.loading}
            />
          )}
          <input
            ref={designsInputRef}
            type="file"
            accept=".txt"
            hidden
            onChange={(e) => onDesignsFile(e.target.files?.[0] ?? undefined)}
          />

          {session.error && <div className="empire-manager__error">{session.error}</div>}
          {!session.error && session.warning && (
            <div className="empire-manager__warning">{session.warning}</div>
          )}

          {/* Replace-file confirmation — sits directly under the upload
              section, never a nested modal (UI-SPEC replace-file confirmation). */}
          {confirm !== null && typeof confirm === "object" && confirm.kind === "replace" && (
            <div className="empire-manager__confirm">
              <div>
                Loading a new file will clear your {session.pendingCount} staged change
                {session.pendingCount === 1 ? "" : "s"} in this session. Continue?
              </div>
              <div className="empire-manager__confirm-actions">
                <button type="button" className="empire-manager__discard" onClick={() => setConfirm(null)}>
                  Keep current file
                </button>
                <button type="button" className="empire-manager__save" onClick={() => void onReplaceConfirm()}>
                  Load anyway
                </button>
              </div>
            </div>
          )}

          {/* Section 2: optional archive upload, collapsed by default */}
          {!session.archive ? (
            <div className="empire-manager__archive">
              {!showArchive ? (
                <button
                  type="button"
                  className="empire-manager__archive-toggle"
                  onClick={() => setShowArchive(true)}
                >
                  + Add an existing archive file (optional)
                </button>
              ) : (
                <div
                  className="empire-drop empire-drop--small"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onArchiveFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => archiveInputRef.current?.click()}
                >
                  {session.loading ? (
                    "Parsing…"
                  ) : (
                    <>
                      Drop your existing <code>user_empire_designs_archive.txt</code> here to keep
                      appending to it
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <LoadedFileRow
              filename={session.archive.filename}
              onChangeFile={() => archiveInputRef.current?.click()}
              disabled={session.loading}
            />
          )}
          <input
            ref={archiveInputRef}
            type="file"
            accept=".txt"
            hidden
            onChange={(e) => onArchiveFile(e.target.files?.[0] ?? undefined)}
          />

          {/* Section 3: designs list + filter */}
          {session.designs && (
            <>
              <input
                type="text"
                className="find-box__input"
                placeholder="Filter your designs…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {entries.length === 0 ? (
                <div className="empire-manager__empty">This file has no saved designs yet.</div>
              ) : (
                <ul className="empire-manager__list">
                  {filteredIndexed.map(({ entry, index }) => {
                    const isRemoved = session.removed.has(index);
                    const metaParts = [
                      humanize(entry.authority ?? "") || null,
                      entry.speciesClass ? humanize(entry.speciesClass) : null,
                    ].filter((p): p is string => Boolean(p));
                    return (
                      <li
                        key={index}
                        className="find-box__result empire-manager__row"
                        data-removed={isRemoved ? "" : undefined}
                      >
                        <RowIcon authority={entry.authority} iconBase={iconBase} />
                        <span className="empire-manager__row-text">
                          <span className="empire-manager__row-name">
                            <PdxName raw={entry.rawName} />
                          </span>
                          <span className="empire-manager__row-meta">{metaParts.join(" · ")}</span>
                        </span>
                        <button
                          type="button"
                          className="empire-manager__row-action"
                          onClick={() => onToggleRemove(index)}
                        >
                          {isRemoved ? "Undo" : "Remove"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {/* Section 4: success banner (replaces the pending-changes summary
              once a save has completed) or the pending-changes summary. */}
          {session.lastSave ? (
            <div className="empire-manager__success">
              <div>
                Saved — {session.lastSave.added} added, {session.lastSave.removed} archived.
              </div>
              {session.lastSave.backupName && (
                <div className="empire-manager__pending-caption">
                  Backup downloaded as{" "}
                  <code className="empire-manager__filename">{session.lastSave.backupName}</code>.
                </div>
              )}
            </div>
          ) : (
            session.pendingCount > 0 && (
              <div className="empire-manager__pending">
                <div>
                  {session.pendingCount} pending change{session.pendingCount === 1 ? "" : "s"}: {addedCount}{" "}
                  added, {removedCount} removed
                </div>
                {removedCount > 0 && (
                  <div className="empire-manager__pending-caption">
                    Removed designs are archived, not deleted.
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <footer className="empire-manager__footer">
          {confirm === "save" ? (
            <div className="empire-manager__confirm">
              <div>
                Save changes: {addedCount} added, {removedCount} archived. Removed designs are never deleted —
                find them in <code>user_empire_designs_archive.txt</code>.
                {session.canWriteInPlace &&
                  " A backup of the original file downloads automatically before saving."}
              </div>
              <div className="empire-manager__confirm-actions">
                <button type="button" className="empire-manager__discard" onClick={() => setConfirm(null)}>
                  Keep editing
                </button>
                <button
                  type="button"
                  className="empire-manager__save"
                  onClick={() => {
                    setConfirm(null);
                    void session.save();
                  }}
                >
                  Save & continue
                </button>
              </div>
            </div>
          ) : confirm === "discard" ? (
            <div className="empire-manager__confirm">
              <div>
                Discard {session.pendingCount} staged change{session.pendingCount === 1 ? "" : "s"}?{" "}
                Nothing on disk has been touched yet — this only clears what you've staged in this session.
              </div>
              <div className="empire-manager__confirm-actions">
                <button type="button" className="empire-manager__discard" onClick={() => setConfirm(null)}>
                  Keep editing
                </button>
                <button
                  type="button"
                  className="empire-manager__save"
                  onClick={() => {
                    setConfirm(null);
                    session.discard();
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <>
              <span className="empire-manager__footer-count">{pendingLabel}</span>
              <div className="empire-manager__footer-actions">
                <button type="button" className="empire-manager__discard" onClick={onDiscardClick}>
                  Discard changes
                </button>
                <button
                  type="button"
                  className="empire-manager__save"
                  disabled={session.pendingCount === 0}
                  onClick={onSaveClick}
                >
                  Save changes
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
