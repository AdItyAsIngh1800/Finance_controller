/**
 * Social preview card.
 *
 * A submission is shared as a link before it is ever opened, and a link that
 * unfurls into a blank rectangle reads as unfinished regardless of what sits
 * behind it. This renders the one figure worth leading with.
 *
 * The figure is the *zero*, not the match rate. A tool can post a high match
 * rate by matching everything to anything; what it cannot fake is never
 * mismatching, which is why `/evaluation` leads with the same number.
 *
 * Rendered by Next's `ImageResponse` at build time via Satori, which is not a
 * browser: it supports flexbox and a subset of CSS only, resolves no CSS
 * variables, and needs every colour written out as a literal. The values below
 * are the light-theme tokens from `globals.css` copied by hand — a social card
 * has no viewer preference to read, so it is always the light one.
 *
 * @see docs/DESIGN.md §2 — the palette these literals come from
 */

import { ImageResponse } from 'next/og';

/** Route segment config — the standard OG card size. */
export const size = { width: 1200, height: 630 };

/** Content type of the generated asset. */
export const contentType = 'image/png';

/** Alt text, used by clients that surface it. */
export const alt =
  'AI Finance Controller — zero false matches across both reconciliation domains';

/* Light-theme tokens, inlined because Satori cannot resolve CSS variables. */
const PAGE = '#f6f6f2';
const INK = '#16171a';
const INK_MUTED = '#6b6c70';
const RULE_STRONG = '#c9c9c2';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: PAGE,
          color: INK,
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* The mark, redrawn as plain divs: Satori renders no inline SVG
              paths, and two rules above a double rule is the whole glyph. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 5,
              width: 56,
              height: 56,
              padding: 12,
              borderRadius: 8,
              background: INK,
            }}
          >
            <div style={{ height: 3, width: 32, background: PAGE }} />
            <div style={{ height: 3, width: 22, background: PAGE }} />
            <div style={{ height: 3, width: 32, background: PAGE, marginTop: 5 }} />
            <div style={{ height: 3, width: 32, background: PAGE }} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
            AI Finance Controller
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, color: INK_MUTED }}>False matches, both domains</div>
          {/* The double rule under a closing figure, as on the accuracy page —
              drawn as two rules rather than `border: double`, which Satori
              cannot parse (it supports solid and dashed only). Two stacked
              divs are also the more literal statement of what a double rule is. */}
          <div style={{ display: 'flex', flexDirection: 'column', width: 260, marginTop: 8 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 190,
                fontWeight: 600,
                letterSpacing: -6,
                lineHeight: 1,
              }}
            >
              0
            </div>
            <div style={{ height: 3, background: RULE_STRONG, marginTop: 14 }} />
            <div style={{ height: 3, background: RULE_STRONG, marginTop: 4 }} />
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.45, color: INK_MUTED }}>
          Matches processor and bank records against your ledger, and states why for every
          discrepancy. The matching engine has no AI in it, deliberately.
        </div>
      </div>
    ),
    size,
  );
}
