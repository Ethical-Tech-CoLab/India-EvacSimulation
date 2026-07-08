# Backlog

This repo is a **mirror** of [`Ethical-Tech-CoLab/India-EvacSimulation`](https://github.com/Ethical-Tech-CoLab/India-EvacSimulation), which holds the fuller modelling backlog (methodology-doc drift, sensitivity-analysis suggestions, factor-correlation extension, etc. — see that repo's `BACKLOG.md`). This file covers issues specific to *this* repo.

## Repo hygiene

- **This repo previously held a stale, simpler snapshot of the tool** — no greedy urgency-ordered assignment, no alerts panel, no Factor Information Value panel, no gatekeeper-specific exclusion labelling, 100 Monte Carlo runs instead of 500. It has now been brought up to date to match the primary repo as of this session. There is currently no mechanism to detect future drift between the two repos other than manually diffing them — worth a lightweight script or GitHub Action that diffs `index.html` between the two remotes and flags divergence.
- **`.gitignore` previously whitelisted only `evacuation-simulator.html`**, meaning the actual tracked file (`index.html`, after a prior rename) was tracked only by coincidence of already being in the index, and any new file (`explainer.html`, this documentation set) would have been silently excluded from `git add -A`. Fixed this session by explicitly whitelisting `index.html`, `explainer.html`, and the four Markdown docs — but the pattern (`* ` then explicit `!` allowlist) means **any future new file needs an explicit gitignore entry** or it will silently fail to track. Consider switching to a denylist (`node_modules/`, `.DS_Store`, etc.) instead of an allowlist, which is easy to forget to update.
- **No `Evacuation_Simulator_Methodology.docx` in this repo.** If this repo is meant to stand alone (e.g. for a reviewer who only has this URL), consider copying the methodology doc here too; if it's meant to always be read alongside the primary repo, a clearer pointer (this README already added one) is the lower-maintenance option.
- **No `LICENSE` file.**
- **No automated tests** — same pure-function test opportunity noted in the primary repo's backlog (`computeReadiness`, `monteCarlo`, `assign`, etc.).

## Suggestion

Given this is explicitly a mirror, the lowest-maintenance long-term setup is probably: keep developing in `India-EvacSimulation`, and periodically sync `index.html` + `explainer.html` here with a one-line copy command rather than hand-editing both. If this repo ever needs to diverge (e.g. a public-facing simplified version vs. an internal research version), that intent should be stated explicitly in the README so future edits don't get "corrected" back into sync by accident.
