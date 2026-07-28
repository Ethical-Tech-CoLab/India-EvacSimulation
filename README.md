# Evacuation Readiness & Uncertainty Simulator

**[Live site](https://ethical-tech-colab.github.io/India-EvacSimulation/)** ·
**[Research report](ERUS-Paper.md)** (plain-language, non-technical)

A single-file, dependency-free research instrument that models how field-intelligence uncertainty degrades civilian evacuation decisions in armed conflict — built for a PhD project on civilian protection. All data is synthetic and reproducible from a seed number; no real locations or real datasets are used.

**Live demo:** [ethical-tech-colab.github.io/India-EvacSimulation](https://ethical-tech-colab.github.io/India-EvacSimulation/)

**This is the primary/canonical repository.** [`indiaclarke03-ops/EvacSimulator`](https://github.com/indiaclarke03-ops/EvacSimulator) mirrors this tool but should be treated as downstream — develop here first.

## Run it

No build step. Open `index.html` in a browser, or serve the folder statically:

```
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

## Run the tests

The scoring/assignment engine (`engine.js`) has a test suite that pins known seed → known output, including the exact numbers cited in [ERUS-Paper.md](ERUS-Paper.md) and this README. No packages to install — it uses Node's built-in test runner:

```
npm test
# or: node --test
```

## What it does

Generates synthetic evacuation destinations and evacuee groups from a seed, scores each destination's readiness across seven factors (three of them non-substitutable "gatekeepers" — Security, Authority consent, Willingness — any of which can hard-cap readiness at 20%), runs 500 Monte Carlo trials per group–destination pair to turn that readiness into a success-probability distribution, and assigns each group to its best-scoring available destination. A "Field Uncertainty" slider degrades every factor's confidence simultaneously, making it possible to watch predicted outcomes fall apart in real time as an information environment worsens — with no underlying condition on the ground actually changing.

A key design point: the model distinguishes an **unassessed** factor ("Unknown") from a **confirmed exclusion** ("Unwilling", for a host community that has explicitly declined) — conflating the two would make an unresolvable refusal look like a solvable intelligence gap. See [CONCEPT.md](CONCEPT.md) for the full reasoning behind this and the other modelling choices.

## Files

| File | Purpose |
|---|---|
| `index.html` | The tool itself — UI and an in-page Methodology accordion, loading `engine.js` for the simulation logic |
| `engine.js` | The scoring, Monte Carlo, and assignment engine — pure, DOM-free, and shared between the browser (as a plain script) and the test suite (as a Node module) |
| `explainer.html` | Narrative walkthrough of the model, linked from "About this tool" and the "?" links throughout the tool |
| `Evacuation_Simulator_Methodology.docx` | Full formula derivations, rationale, and academic/IHL citations — authoritative if it and the in-app docs ever disagree |
| `CONCEPT.md` | The research problem, the readiness model, and the epistemic distinctions the tool insists on |
| `ARCHITECTURE.md` | How it's actually built — execution pipeline, state, configuration surface |
| `BACKLOG.md` | Open issues and suggested next steps from a close read of the code and methodology doc |
| `SECURITY.md` | Vulnerability reporting process and scope |
| `LICENSE` | MIT |
| `tests/engine.test.js` | Regression tests for `engine.js`, run with `npm test` |

## Reproducibility

Every output is fully determined by four values: seed, number of destinations (N), number of evacuee groups (M), and uncertainty level. The **Copy link** button writes all four into the page URL and copies it to your clipboard — pasting that URL anywhere and opening it regenerates the exact same scenario. Cite outputs as `seed=42, N=8, M=3, uncertainty=30%` (see the methodology doc's Reproducibility Protocol for the full citation format).

## Status

Conceptual demonstration tool for thesis research, not an operational decision-support system. Outputs require empirical calibration before any real-world use — see the Assumptions & Limitations section in the Methodology accordion (in-app) or §10 of the methodology document.

---

## Peer Review

The full independent academic peer review of this report is in [PEER-REVIEW.md](PEER-REVIEW.md) (also available as [Word](peer-review/erus-Peer-Review.docx) under [`peer-review/`](peer-review/)).

**Recommendation:** Major revisions

**What the review found:**

- The headline finding (worse information yields worse outcomes) is an algebraic identity of the confidence formula, verified in code, not a demonstrated result (S1.3, S14.1). — **Fixed.**
- The report poses three research questions and describes all outputs but reports no actual numbers, tables, or figures (S2.5, S6, S9). — **Fixed.**
- The 40% success threshold is misattributed to the UNHCR Handbook despite readiness being the tool's own internal construct (S5.10, S8.2). — **Fixed.**

### Revisions applied

- **The 40% threshold is no longer attributed to UNHCR.** Readiness is this tool's own composite of seven factor scores, so no external handbook could define a minimum readiness threshold for it. The floor is now labelled an unsourced, uncalibrated internal modelling assumption in the paper (S5.10, S8.2) and in the source tables of both `index.html` and `explainer.html`, where it appears as its own row reading "No external source." The UNHCR Handbook is retained for what it does support — informing which readiness factors are worth modelling.
- **The headline is reframed as a built-in assumption rather than a result** (S1.3, S14.1). Uncertainty enters at exactly one place, `effectiveConf = baseConf × (1 − fieldUncertainty)`, and factor scores are `base × (0.5 + 0.5 × effectiveConf)` — monotonically increasing in confidence. The downward sensitivity curve is therefore an algebraic identity of the scoring rule for any one destination, and the contribution is restated as *operationalising* the premise explicitly in one auditable line, not demonstrating it, with a note that no result in the paper should be read as independent evidence for it.
- **The report now reports actual results.** ERUS-Paper.md §6.8–§6.12 runs the citation the reproducibility section names (seed 42, eight destinations, three groups, thirty per cent uncertainty) and reports the real assignment matrix, sensitivity curves for two contrasting group types, and the Factor Information Value ranking, answering all three research questions from §2.5 against actual numbers instead of restating them. Producing these numbers also surfaced two previously-unflagged issues, now tracked in [BACKLOG.md](BACKLOG.md): the sensitivity chart's destination-selection step can pick a capacity-infeasible site and render a misleadingly non-monotonic curve, and the Factor Information Value panel's ranking is not statistically resolvable from noise at its default 100-run count.

**Noted strength:** The generate-once architecture, the Unknown-vs-Unwilling distinction (S7.2), and URL-level reproducibility are genuinely well-designed.
