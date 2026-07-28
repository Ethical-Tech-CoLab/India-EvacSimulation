# Architecture

## Shape of the codebase

This is a **dependency-free HTML/JS application with no build step or package manager** — no framework, nothing to install to run it. Markup, CSS, and rendering live in `index.html`; the simulation engine itself lives in `engine.js`, loaded by `index.html` as a plain classic `<script>` (its top-level `const`/`function` declarations share the page's global scope with the inline script that follows it — no bundler, no module loader). This split exists so the same engine code is `require()`-able from Node for the test suite under `tests/`, without changing how the page loads in a browser. This is a deliberate choice for a research artifact: it must run by opening a file in a browser, forever, without a toolchain to rot.

```
index.html          UI, rendering, in-page Methodology accordion (~1,000 lines)
engine.js            the simulation engine — RNG, scoring, Monte Carlo, assignment;
                     DOM-free, loaded by index.html and require()'d by tests/
tests/engine.test.js  regression suite for engine.js (Node's built-in test runner,
                     run via `npm test`; zero npm dependencies)
explainer.html       companion page — narrative walkthrough of the model, linked from the
                     "About this tool" button and from ? links throughout index.html
METHODOLOGY.md        full formula derivations, rationale, and citations — tracked in
                     git and updated alongside engine.js; authoritative for formulas if
                     it and the in-app docs ever disagree
```

A `Evacuation_Simulator_Methodology.docx` was previously named here as the authoritative methodology source. It was excluded from version control by `.gitignore` and had fallen behind the code; it has been retired in favour of `METHODOLOGY.md`, which is git-tracked. See `METHODOLOGY.md`'s own "Relationship to the old .docx" section for the full history.

Two supplementary raw data files (an ACLED CSV export and several UNHCR/OCHA "5W" spreadsheets) were noted here in an earlier version of this document as living alongside the application in some local checkouts. They are **not read or referenced by the application**, are excluded from `.gitignore`, and — checked against this repository's full commit history — have never actually been committed to it (see `BACKLOG.md`).

## Execution pipeline

Every scenario generation or uncertainty-slider move re-runs this pipeline:

```
Seeded RNG  →  Data Generator  →  Readiness Scorer  →  Monte Carlo Engine  →  Assignment  →  Render
   (§1)           (§2)               (§3)                  (§4)               (§5)          (§6)
```

1. **Seeded RNG** (`class RNG`) — Park-Miller LCG (`s_{n+1} = (s_n × 16807) mod 2147483647`). The single source of every random value in the app; `Math.random()` is never called. This is what makes any scenario exactly reproducible from a seed number.

2. **Data Generator** (`generateDestinations`, `generateGroups`) — builds synthetic destinations (7 factor statuses + base confidences, capacity via exponential distribution, distance) and evacuee groups (drawn from 8 fixed archetypes, only size randomised). Runs once per "Generate Scenario" click, not on every uncertainty change.

3. **Readiness Scorer** (`computeReadiness`) — pure function: `(destination, confidenceMultiplier, statusOverrides) → { readiness, gkBlocked, factorScores }`. Applies the weighted-average formula and the gatekeeper cap. Called on every uncertainty-slider tick and, with status overrides, inside every Monte Carlo trial.

4. **Monte Carlo Engine** (`monteCarlo`, `perturbStatus`) — 500 trials per (group, destination) pair. Each trial independently perturbs every factor's status with probability proportional to `(1 − effectiveConfidence)`, then re-scores readiness. Seeded deterministically per pair (`seed = groupIndex × 1000 + destIndex + 1`) so results are reproducible across uncertainty levels.

5. **Assignment** (`assign`, `compositeScore`) — groups sorted by urgency (immediate → urgent → can-wait), assigned greedily to the highest-composite-score destination with remaining capacity. Tracks residual capacity across groups (real contention, not independent assignment), and can leave a group `unassigned` if all viable sites fill up.

6. **Render** — a set of pure-ish `render*` functions (`renderDestCards`, `renderMatrix`, `renderOutcomes`, `renderAlerts`, `renderChart`, `renderInfoValue`, `renderInsights`) that each own one DOM region and are called in sequence from `runSimulation()`. None of them mutate simulation state — they only read `state` and write `innerHTML`/SVG.

A parallel lightweight path, `computeInfoValue` / `assignForInfoValue`, answers "if we resolved every Unknown instance of factor X to Operational, how much would mean success rate improve?" — a real counterfactual re-simulation (100 runs, cheaper than the main 500-run path), not a static heuristic.

## State

A single mutable object, `state`, holds everything: `destinations`, `groups`, `assignments`, `curves` (pre-computed uncertainty-sensitivity data per group), and `uncertaintyLevel`. There is no framework-managed reactivity — `runSimulation()` is called explicitly after any state change and re-renders everything downstream. This is intentional simplicity for a ~1,300-line single-author research tool; see BACKLOG.md for where this would need to change if the tool grew.

## Configuration surface

All tunable constants live in one object, `PARAMS`, at the top of `engine.js`, with human-readable descriptions in the adjacent `PARAM_DOCS` object in `index.html` — the same pairing renders live in the "⚙ Model Parameters" panel in the UI. This is the intended entry point for sensitivity analysis: change a value in `PARAMS`, reload, observe the effect, with no other code changes required.

## Factor model

`FACTORS` is an ordered array of 7 factor descriptors (`id`, `label`, `short` code, `gk` boolean, optional `blockedLabel`). Three carry `gk: true` (Security, Authority consent, Willingness). Willingness additionally carries `blockedLabel: 'Unwilling'` — when its status is `'blocked'`, the UI and generated insight text display "Unwilling" instead of the generic "Blocked", via the `statusLabel(factor, status)` helper. `blockedGkFactors(dest)` returns the specific blocked gatekeepers for a destination, used everywhere a blanket "GK BLOCKED" badge used to appear (destination cards, alerts, the AI Role insight text) so the UI always names *which* exclusion applies rather than collapsing three distinct failure modes into one badge.

## URL state

`updateURL()` / `loadFromURL()` serialize `seed`, `n` (destinations), `m` (groups), and `u` (uncertainty %) into query parameters via `history.replaceState`. The "Copy link" button calls `updateURL()` then writes `window.location.href` to the clipboard — this is how a scenario becomes shareable and citable (see the Reproducibility Protocol in the methodology doc).

## Companion page

`explainer.html` is a separate, self-contained page (own `<style>` block, no shared CSS file) with numbered `id="card-N"` sections. `index.html` links into specific sections via `explainer.html#card-N` — the small "?" buttons next to each panel header ("qmark" links) each target the card that explains that panel. Keeping these two files' factual claims in sync (MC run count, gatekeeper count, assignment algorithm description) is a manual process — see BACKLOG.md.
