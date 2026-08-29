# Tech Stack — AI Finance Controller

**Last updated:** 29 August 2026
**Constraint that shaped every choice below:** six days, solo, must be deployed and demoable.

The governing principle is **fewest moving parts that meet the requirement.** Every technology below either does a job nothing already in the stack can do, or it earned its place by removing more work than it added. Rejected alternatives are recorded because "why not X" is a question worth having an answer to.

---

## Summary

| Layer | Choice |
|---|---|
| Language | TypeScript (end to end) |
| Framework | Next.js (App Router) |
| UI | React + Tailwind CSS |
| AI | Google Gemini API via `@google/genai` |
| Reconciliation | Plain TypeScript — **no AI, no framework** |
| Fuzzy matching | `fastest-levenshtein` |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + `@supabase/ssr`, Google OAuth |
| Storage | Supabase Storage |
| Testing | Vitest |
| Hosting | Vercel |

---

## 1. Language — TypeScript

**Why.** One language across frontend, API routes, reconciliation engine, and data generator. Every language boundary in a one-week build is a serialization format to agree on and a context switch to pay for.

The stronger reason is domain-specific: this project's core correctness risk is monetary arithmetic. A discriminated union over the exception taxonomy and a `bigint`-typed money path mean the compiler catches a whole class of reconciliation bug before a test does.

**Rejected:** Python + FastAPI. Better data-wrangling ergonomics (pandas, rapidfuzz), but it buys a second deploy target, a second dependency manager, and an API boundary — for a matching problem that is a few hundred lines of arithmetic. Worth it only if the team were meaningfully faster in Python; solo and TypeScript-comfortable, it is a net loss.

---

## 2. Framework — Next.js (App Router)

**Why.** Frontend and backend in one deployable unit. API routes host ingestion, reconciliation, extraction, and the agent endpoint without standing up a separate server. Server Components keep the Supabase service role and Gemini key server-side by construction rather than by discipline.

**Rejected:** Vite + separate Express backend — two deploy targets, CORS, duplicated auth handling. Remix — comparable capability, no advantage here, and worse Vercel integration.

---

## 3. UI — React + Tailwind CSS

**Why Tailwind.** The UI is dense and tabular: exception queues, side-by-side comparisons, confidence highlighting. Utility classes keep that styling adjacent to the markup instead of in a parallel file, which matters when iterating fast on tables.

**On component libraries.** Deliberately none by default. The interface is mostly tables, badges, and disclosure rows — a component library's cost here is integration and bundle weight, not saved time. If a genuinely fiddly primitive is needed (a modal or combobox with correct focus trapping), pull that single primitive from `shadcn/ui` rather than adopting a design system wholesale.

---

## 4. AI — Google Gemini API via `@google/genai`

**Why Gemini.** Specified by the developer. It suits both AI stages well:

- **Native multimodal document input** — PDFs and images go in directly. This removes an entire dependency category: no Tesseract, no `pdf-parse`, no OCR pipeline, no image preprocessing. For Stage 1 that is the single largest time saving in the build.
- **Structured output via `responseSchema`** — extraction returns schema-conforming JSON with per-field confidence, so the confidence gate is a data property rather than parsing guesswork.
- **Function calling** — the mechanism the grounded Q&A agent is built on.

**Package: `@google/genai`.** The current unified SDK. The older `@google/generative-ai` appears throughout tutorials and is the wrong package to start a new project on.

**Model tier: Flash by default.** Current pricing puts the Flash tier roughly an order of magnitude below the Pro tier; Flash is more than capable of schema-constrained extraction and grounded Q&A. Pro is held as a named upgrade path for one specific trigger — Flash underperforming on degraded scans in Stage 1 — not as a default.

> **Build-time action:** confirm the exact current model ID in AI Studio rather than copying one from documentation. Gemini model naming has iterated several times this year, and a stale ID is a 404 discovered at the worst moment.

**Where AI is deliberately *not* used:** the reconciliation engine (§5). That is an architectural position, not an omission — see `ARCHITECTURE.md` §AI Trust Boundaries.

---

## 5. Reconciliation Engine — Plain TypeScript

**Why nothing.** No library, no framework, no model. Tiered matching over amounts, dates, and reference strings is arithmetic and comparison. A rules engine would add configuration indirection over roughly two hundred lines of clear code, and an LLM would add non-determinism to a problem that has exact answers.

This is the most consequential technology decision in the project, and the decision is to use no technology at all.

**Consequences that are the point:** the engine is deterministic (identical input → byte-identical output), unit-testable without mocks or network, and fully auditable. It is also the layer that makes the Q&A agent trustworthy — the agent explains results it did not compute.

**One dependency: `fastest-levenshtein`.** Reference-string similarity for Tier 3. A few kilobytes, zero transitive dependencies, and a correct implementation of an algorithm that is easy to write subtly wrong. Chosen over `fuse.js` (heavyweight for one distance calculation) and over hand-rolling (the correct-on-edge-cases version is not shorter than the import).

---

## 6. Database — Supabase (PostgreSQL)

**Why.** Specified by the developer, and a good fit. Managed Postgres with a `bigint` money path and JSONB for domain-specific detail. The decisive feature is **Row-Level Security**: per-user isolation enforced in the database rather than in application code, which is the difference between a login screen and actual data isolation.

Supabase also collapses three services into one signup — database, object storage, and auth — which for a six-day build is the argument that settles it.

**Rejected:** Postgres on Neon/Railway + separate S3 + separate auth provider — three accounts, three SDKs, three sets of credentials, one week.

---

## 7. Auth — Supabase Auth + `@supabase/ssr`

**Why.** Already present in the Supabase project; no new service, no new dependency beyond the SSR helper.

**Package: `@supabase/ssr`.** The current path for Supabase auth in the Next.js App Router — cookie-based sessions across Server Components, Route Handlers, and middleware. Its predecessor `@supabase/auth-helpers-nextjs` is deprecated and still widely tutorialised.

**Google OAuth as the sign-in method.** No SMTP configuration, no email templates, no password reset flow to build — and judges get one-click access instead of an account-creation chore.

**RLS is the actual requirement.** Google sign-in gates the UI. Without RLS, anyone holding the anon key still reads every row. The policies are the security control; the login screen is the front door. See `DATA_MODEL.md` §6.

---

## 8. Storage — Supabase Storage

**Why.** Uploaded PDFs and images need somewhere to live that is not the database. Same project, same client, same auth context, path-prefixed per-user policies.

---

## 9. Testing — Vitest

**Why.** The reconciliation engine is pure functions over fixture data — the ideal test target, and the one place in this build where tests genuinely earn their keep. Vitest runs TypeScript without a compile step and needs no configuration beyond defaults.

**Scope, deliberately narrow.** Engine correctness against the ground-truth manifest, adapter normalization, and money parsing. **No component tests, no E2E suite.** In a six-day build those cost more than the confidence they return; the engine tests are load-bearing because they are what `EVALUATION.md` reports.

---

## 10. Hosting — Vercel

**Why.** First-party Next.js support: `git push` deploys frontend and API routes together with zero configuration. Environment variables for the Supabase and Gemini keys; preview deployments per branch.

**Deploy on Day 3, not Day 6.** The Phase 4 shell goes live the moment it renders a login screen. Deployment and OAuth-redirect problems then surface with days of runway rather than hours — the redirect URL mismatch between localhost and production is a classic final-night failure and is best discovered early.

---

## 11. Explicitly Not Used

| Not used | Why not |
|---|---|
| LangChain / LlamaIndex / agent frameworks | Two AI calls with a defined schema and four functions. A framework would be more code than the code. |
| An OCR library (Tesseract, `pdf-parse`) | Gemini reads documents natively. This is the largest dependency avoided. |
| An ORM (Prisma, Drizzle) | The Supabase client is already typed. A second data-access layer over eight tables is indirection, not safety. |
| Redis / caching | Reconciliation runs are on-demand and sub-five-second. Nothing to cache. |
| A job queue | Extraction is per-document and synchronous within request limits. |
| Docker | Vercel builds from source. A container adds a build step and nothing else. |
| CI/CD (GitHub Actions) | Vercel's deploy-on-push already reports build failures. `npm test` runs locally before each push. Revisit if the test suite grows enough to gate on. |
| A state library (Redux, Zustand) | Server Components plus URL state cover it. |
| Multi-currency handling | Out of scope; see `PRD.md` §6. |

---

## 12. Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Anon key — safe to expose **only because RLS is enabled** |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Server-side operations; bypasses RLS, never sent to the client |
| `GEMINI_API_KEY` | **server only** | All Gemini calls originate from API routes |
| `GEMINI_MODEL_ID` | server | Model ID as an env var, not a literal — provider naming drifts |

The anon key being publicly shipped is safe **only** while RLS holds. That is the dependency between §6 and §7, and it is the reason RLS is a P0 requirement rather than a hardening task.
