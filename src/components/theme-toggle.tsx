'use client';

/**
 * Theme control.
 *
 * Three states, not two: `system` follows the operating system and is the
 * default, and `light`/`dark` pin the choice. A two-state toggle would be
 * simpler, but once clicked it can never return to following the OS — a user
 * who flips it to look at something has silently opted out of their machine's
 * evening switch to dark with no way back.
 *
 * The stored value is the *preference* (`system` included), never the resolved
 * theme, so a viewer who chose `system` in daylight still gets dark at night.
 *
 * @see docs/DESIGN.md §7.1
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  applyTheme,
  readStoredTheme,
  setTheme,
  subscribeToTheme,
  type ThemePreference,
} from '@/lib/theme';

/** The three choices, in the order they cycle. */
const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Icon and accessible name for each preference. */
const PRESENTATION: Readonly<Record<ThemePreference, { icon: string; label: string }>> = {
  system: { icon: '◐', label: 'Theme: follow system' },
  light: { icon: '☀', label: 'Theme: light' },
  dark: { icon: '☾', label: 'Theme: dark' },
};

export function ThemeToggle() {
  // The preference lives in localStorage, which React does not own and another
  // tab can change. `useSyncExternalStore` reads it during render without the
  // server/client markup disagreeing: the third argument is the server
  // snapshot, and `system` is what the pre-paint script assumes too.
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToTheme,
    readStoredTheme,
    () => 'system',
  );

  // While the preference is `system` the OS can change under us — a scheduled
  // switch at sunset, or the user toggling it in system settings — and the page
  // should follow without a reload.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system');
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [preference]);

  const advance = (): void => {
    setTheme(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length] ?? 'system');
  };

  const { icon, label } = PRESENTATION[preference];

  return (
    <button
      type="button"
      onClick={advance}
      title={label}
      aria-label={label}
      className="rounded-control px-1.5 py-1.5 text-xs text-ink-muted transition-colors duration-150 ease-ui hover:bg-paper-sunk hover:text-ink sm:px-2"
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {icon}
      </span>
    </button>
  );
}
