import { useRef, useState } from "react";
import type { DesignsSession } from "../lib/empire/useDesignsSession";
import { supportsFsAccess } from "../lib/fsAccess";
import { PdxName } from "./PdxName";

/**
 * Empire Designs manager dialog (04-05). Upload → list → stage-removal flow
 * only: writing files back (splice + download/write-back) is 04-06, and
 * adding empires from a loaded save is 04-07. This component never imports
 * a parser module statically — every parse call goes through `session`'s
 * actions, which lazy-load `designsText.ts` themselves.
 */

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
  const designsInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const openDesignsPicker = () => {
    if (supportsFsAccess()) {
      void session.loadDesignsViaPicker();
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

  const entries = session.designs?.entries ?? [];
  const filteredIndexed = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.displayName.toLowerCase().includes(filter.toLowerCase()));

  const addedCount = session.adds.length;
  const removedCount = session.removed.size;

  return (
    <div
      className="empire-manager__backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          <button type="button" className="empire-manager__close" onClick={onClose} aria-label="Close">
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

          {session.error && <div className="empire-panel__error">{session.error}</div>}
          {!session.error && session.warning && (
            <div className="empire-manager__warning">{session.warning}</div>
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
                          onClick={() => session.toggleRemove(index)}
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

          {/* Section 4: pending changes summary */}
          {session.pendingCount > 0 && (
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
          )}
        </div>

        <footer className="empire-manager__footer">
          <span className="empire-manager__footer-count">
            {session.pendingCount} pending change{session.pendingCount === 1 ? "" : "s"}
          </span>
          <div className="empire-manager__footer-actions">
            <button type="button" className="empire-manager__discard" onClick={session.discard}>
              Discard changes
            </button>
            <button
              type="button"
              className="empire-manager__save"
              disabled={session.pendingCount === 0}
              onClick={() => {
                // TODO(04-06): wire splice + write-back/download save flow.
              }}
            >
              Save changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
