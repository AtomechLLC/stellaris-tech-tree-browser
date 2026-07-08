/**
 * Fixed top header strip (UI-SPEC App Shell Layout). Renders immediately,
 * even during loading, so the app never looks broken/blank during the
 * fetch+layout window.
 */
export function Header() {
  return (
    <header className="app-header">
      <h1 className="app-header__title">Xelnath's Stellaris Tech Finder</h1>
    </header>
  );
}
