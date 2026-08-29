<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Project rules

These apply to all work in this repository and override default agent behaviour.

## 1. Discuss before deviating from the agreed plan

Executing a step of the agreed plan needs no further discussion. Anything beyond
it does.

When a task surfaces a decision the plan did not cover — a new dependency, a
changed approach, an extra file or module, different sequencing, a schema change
— **stop and lay out the options and trade-offs before writing code.** Get
agreement, then proceed.

Do not resolve unplanned decisions silently and report them afterwards.

The current plan lives in `docs/ROADMAP.md`; phase gates and verification steps
are defined there.

## 2. Comment, type-check, and document everything

Every file added or modified must carry:

- **Docstrings** — TSDoc on every exported function, type, interface, and module.
  Module-level docstrings state what the module is for and why it exists.
- **Explicit types** — annotate module boundaries rather than relying on
  inference. `any` requires a written justification; prefer `unknown` with a
  type guard.
- **Comments explaining *why*** — particularly for non-obvious logic, deliberate
  simplifications, and decisions that look wrong without context. A deliberate
  simplification must name its ceiling and its upgrade path.
- **Cross-references** — link the governing document with `@see docs/FILE.md §N`
  where a decision is recorded there.

Both `npm run typecheck` and `npm test` must pass before a commit. Do not strip
documentation to reduce diff size.

## 3. Commit after every change

Commit after every addition, deletion, or update, using the
`commit-message-helper` skill.

When using that skill, **output only the single best commit message.** No
alternatives, no preamble, no explanation of why that message was chosen.

Split unrelated changes into separate atomic commits — one commit per logical
reason someone might revert it.
