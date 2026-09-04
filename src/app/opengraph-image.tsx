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
 * are the **dark** tokens from `globals.css` copied by hand. A social card has
 * no viewer preference to read, and Midnight Ink with brass is the register the
 * palette is designed from — a cream card would be the derived theme standing
 * in for the brand.
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

/* Dark-theme tokens, inlined because Satori cannot resolve CSS variables. */
const PAGE = '#11130f';
const INK = '#e9dfc9';
const INK_MUTED = '#a69e8b';
/** The signature accent — the one place the card is allowed to shine. */
const BRASS = '#c5a15b';

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
              paths. Two columns of unequal height on a shared baseline, which
              is the same figure the real glyph draws. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              width: 56,
              height: 56,
              padding: 11,
              borderRadius: 8,
              background: BRASS,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 26 }}>
              <div style={{ width: 4, height: 26, background: PAGE, borderRadius: 2 }} />
              <div style={{ width: 4, height: 17, background: PAGE, borderRadius: 2 }} />
            </div>
            <div style={{ width: 34, height: 4, background: PAGE, borderRadius: 2, marginTop: 4 }} />
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
                color: BRASS,
              }}
            >
              0
            </div>
            <div style={{ height: 3, background: BRASS, marginTop: 14 }} />
            <div style={{ height: 3, background: BRASS, marginTop: 4 }} />
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
