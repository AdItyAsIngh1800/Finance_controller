/**
 * Theme preference resolution.
 *
 * Shared by the blocking script in the document head and by the toggle, so both
 * agree on the storage key and on how a preference becomes an applied theme.
 * A mismatch between them would show up as a flash of the wrong theme on every
 * load, which is exactly the class of bug this module exists to prevent.
 *
 * @see docs/DESIGN.md §7.1
 * @module
 */

/** What the viewer asked for. `system` defers to `prefers-color-scheme`. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The theme actually painted. */
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key holding a pinned preference. Absent means `system`. */
export const THEME_STORAGE_KEY = 'theme';

/**
 * Reads the stored preference.
 *
 * @returns The pinned preference, or `system` when nothing valid is stored.
 */
export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Blocked site data throws rather than returning null.
    return 'system';
  }
}

/**
 * Applies a preference to the document.
 *
 * Writes `data-theme` on the root element, which is what the dark token block
 * in `globals.css` selects on.
 *
 * @param preference - The preference to resolve and apply.
 * @returns The theme that was actually applied.
 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved: ResolvedTheme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/* --------------------------------------------------------------- store ---
 *
 * The stored preference is external state that React does not own: it lives in
 * localStorage, and another tab can change it. `useSyncExternalStore` is the
 * supported way to read that during render, and it avoids the cascading render
 * that setting state from an effect would cause.
 */

/** Callbacks to run when the preference changes. */
const listeners = new Set<() => void>();

/**
 * Subscribes to preference changes, local and cross-tab.
 *
 * @param onChange - Called whenever the stored preference may have changed.
 * @returns An unsubscribe function.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  // Fired by other tabs of the same origin, so a change made in one tab is
  // reflected in the rest without a reload.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Persists a preference and notifies subscribers.
 *
 * `system` is stored as the *absence* of a key rather than the string
 * `"system"`, so a viewer who never touches the control and one who explicitly
 * chooses to follow the OS end up in the same state.
 *
 * @param preference - The preference to persist and apply.
 */
export function setTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private browsing and blocked site data both throw. The theme still
    // applies for this page view; it simply will not be remembered.
  }
  applyTheme(preference);
  for (const listener of listeners) listener();
}

/**
 * The script that resolves the theme before first paint.
 *
 * Inlined into `<head>` and executed synchronously, ahead of any rendering, so
 * the correct palette is in place for the first frame. Deferring this to a React
 * effect would paint the light theme first and then repaint — the "flash of
 * wrong theme" that makes dark mode feel broken.
 *
 * Kept as a hand-minified string rather than generated from the functions above
 * because it must not depend on any bundle having loaded. Its behaviour is the
 * same as {@link applyTheme} with {@link readStoredTheme}, and the two must be
 * changed together.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var d=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;
