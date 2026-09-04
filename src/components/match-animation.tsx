/**
 * The hero animation: two records snapping into a match.
 *
 * What the product does, in about four seconds, without a sentence of copy. A
 * processor record slides in from the left and a ledger record from the right;
 * they meet, settle together, and a check mark draws itself.
 *
 * Pure SVG with SMIL-free CSS keyframes — no library, no JavaScript, no state.
 * The whole thing is inert markup the browser animates, so it costs nothing at
 * runtime and cannot break hydration.
 *
 * `prefers-reduced-motion` is respected the strong way rather than the weak
 * one. The global rule in `globals.css` collapses every duration to 0.01ms,
 * which for a *looping* animation would leave the two records permanently
 * stacked at their start positions — reading as a bug rather than as a
 * still. Instead the reduced-motion block below pins every element to its
 * final, resolved state: matched, aligned, tick drawn. That is the frame worth
 * showing when motion is unwelcome, and it is also what the animation is
 * ultimately saying.
 *
 * The closing double rule is brass, the same accent as the mark in the header —
 * the animation resolves into the product's own glyph, which is what the mark
 * has always meant.
 *
 * Decorative: the surrounding section states the same thing in text, so the
 * whole figure is hidden from assistive technology rather than described.
 *
 * @see docs/DESIGN.md §7.1.2 — the on-load animation exclusion this reverses
 */

/**
 * Geometry, named so the keyframes and the markup cannot drift apart.
 *
 * The travel distance and the viewBox are coupled: each card slides 44 units
 * outward, so the left card reaches x=0 and the right reaches x=400 at full
 * separation. Widening the travel without widening the viewBox crops a card at
 * the far end of its slide, which is how this was first written.
 */
const CARD_WIDTH = 132;
const CARD_HEIGHT = 46;

export function MatchAnimation() {
  return (
    <div aria-hidden="true" className="mt-8 select-none">
      <style>{`
        @keyframes fc-slide-left {
          0%, 8%    { transform: translateX(-44px); opacity: 0; }
          22%, 62%  { transform: translateX(-44px); opacity: 1; }
          78%, 100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes fc-slide-right {
          0%, 8%    { transform: translateX(44px); opacity: 0; }
          22%, 62%  { transform: translateX(44px); opacity: 1; }
          78%, 100% { transform: translateX(0); opacity: 1; }
        }
        /* The snap: a single tightening at the moment the two meet. */
        @keyframes fc-snap {
          0%, 74%   { opacity: 0; transform: scale(0.86); }
          82%       { opacity: 1; transform: scale(1.06); }
          88%, 100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fc-draw {
          0%, 80%   { stroke-dashoffset: 22; }
          92%, 100% { stroke-dashoffset: 0; }
        }
        /* The rule beneath, drawn as the pair settles. */
        @keyframes fc-rule {
          0%, 72%   { transform: scaleX(0); }
          86%, 100% { transform: scaleX(1); }
        }
        .fc-left   { animation: fc-slide-left 4.4s var(--ease-ui) infinite; }
        .fc-right  { animation: fc-slide-right 4.4s var(--ease-ui) infinite; }
        .fc-badge  { animation: fc-snap 4.4s var(--ease-ui) infinite; transform-origin: center; }
        .fc-tick   { stroke-dasharray: 22; animation: fc-draw 4.4s var(--ease-ui) infinite; }
        .fc-rule   { transform-origin: center; animation: fc-rule 4.4s var(--ease-ui) infinite; }

        @media (prefers-reduced-motion: reduce) {
          /*
            Not "no animation" — the resolved frame. A looping animation frozen
            at 0% shows the two records apart and the tick undrawn, which reads
            as broken rather than as still.
          */
          .fc-left, .fc-right, .fc-badge, .fc-tick, .fc-rule { animation: none; }
          .fc-left, .fc-right { transform: translateX(0); opacity: 1; }
          .fc-badge { opacity: 1; transform: scale(1); }
          .fc-tick { stroke-dashoffset: 0; }
          .fc-rule { transform: scaleX(1); }
        }
      `}</style>

      <svg
        viewBox="0 0 400 132"
        className="h-auto w-full max-w-[22rem]"
        role="presentation"
        focusable="false"
      >
        {/* Processor side. */}
        <g className="fc-left">
          <rect
            x="44"
            y="30"
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            rx="7"
            className="fill-paper-raised stroke-rule"
            strokeWidth="1"
          />
          <text x="56" y="48" className="fill-ink-muted" fontSize="9" letterSpacing="0.9">
            PROCESSOR
          </text>
          <text x="56" y="66" className="fill-ink" fontSize="13" fontWeight="600">
            ₹1,250.00
          </text>
        </g>

        {/* Ledger side. */}
        <g className="fc-right">
          <rect
            x="224"
            y="30"
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            rx="7"
            className="fill-paper-raised stroke-rule"
            strokeWidth="1"
          />
          <text x="236" y="48" className="fill-ink-muted" fontSize="9" letterSpacing="0.9">
            LEDGER
          </text>
          <text x="236" y="66" className="fill-ink" fontSize="13" fontWeight="600">
            ₹1,250.00
          </text>
        </g>

        {/* The match badge, on the settled colour. */}
        <g className="fc-badge">
          <circle cx="200" cy="53" r="15" className="fill-settled-wash stroke-settled" strokeWidth="1.5" />
          <path
            d="M193 53.5l4.6 4.6 9-9.4"
            className="fc-tick stroke-settled"
            fill="none"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* The closing rule: matched, and the figure is final. */}
        <g className="fc-rule">
          <rect x="132" y="92" width="136" height="1.5" className="fill-accent" />
          <rect x="132" y="97" width="136" height="1.5" className="fill-accent" />
        </g>
        <text x="200" y="118" textAnchor="middle" className="fill-ink-muted" fontSize="10">
          Matched on exact reference
        </text>
      </svg>
    </div>
  );
}
