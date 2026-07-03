# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow these unless the question requires otherwise.

## Stack

- **Zero-dependency Node (`.mjs`)** for anything touching a live external API or pure logic — Node 18+ global `fetch`, `node:http` for a tiny server. No `npm install`, no framework. Keeps spikes runnable with a single `node file.mjs`.
- **Single self-contained `index.html`** (no build, no server, all state simulated in-page) for UX/experience mocks — open directly in a browser.
- Matches the parent project (Next.js/TypeScript) only conceptually; spikes stay dependency-free for speed.

## Structure

- One directory per spike: `.planning/spikes/NNN-descriptive-name/`.
- Live-API spikes: `server.mjs` (proxies calls server-side to dodge CORS + keep secrets off the client) serving an inline HTML UI on a fixed port (001 used 5170).
- Logic/mapping spikes: a single `*.mjs` that self-verifies with assertions, prints a VERDICT, exits non-zero on failure, and writes reusable JSON output for downstream spikes.
- UX spikes: a single `index.html`.
- Every spike has a `README.md` with full frontmatter, Research, Investigation Trail, and Results.

## Patterns

- **Secrets never touch disk or git.** API keys are entered at runtime in the browser and forwarded server-side (spike 001); mocks use fake keys.
- **Forensic log layer** for anything with runtime behavior: an in-memory `{ts, category, ...}` event array, viewable + exportable as JSON. Real spikes log actual request/response/error; UX mocks log simulated events to model production telemetry.
- **Funūn brand tokens in mocks:** dark `#0a0a0f` bg, `#12121c` cards, `#23233a` hairlines, `#818CF8→#D946EF` gradient for primary CTAs — so the mock reads as Funūn.
- **Spikes chain:** later spikes reuse earlier outputs (002's `buffer-inputs.json` feeds 001's harness; 003's flow reuses 002's mapping + coverage-gap concept).

## Tools & Libraries

- Buffer new GraphQL API: endpoint `https://api.buffer.com`, `Authorization: Bearer <personal-key>`. No SDK needed — raw `fetch` with a GraphQL body.
- Node global `fetch` (18+) confirmed working against the live Buffer endpoint.
- Avoid: OAuth libraries (Buffer third-party OAuth is closed to new apps), image-upload libs (Buffer requires pre-hosted public URLs).
