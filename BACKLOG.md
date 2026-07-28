# Backlog

Suggestions from a close read of the code, the methodology document, and the git history. Ordered roughly by leverage, not urgency.

Resolved items have been removed from this list rather than kept with a strikethrough — see `git log` for their history, README.md's Peer Review section for how the peer-reviewed findings were addressed, and `METHODOLOGY.md`'s changelog for what changed in the formulas.

## Documentation drift

- **`explainer.html` can still drift from `index.html`.** Past drift (MC run count, gatekeeper count, an assignment-independence claim) has been corrected, but nothing *mechanically* prevents it recurring on the next feature change. Since it's a second prose description of the same model as the in-app Methodology accordion and `METHODOLOGY.md`, consider whether it should exist as *generated* HTML from a shared source (e.g. a JSON/YAML description of factors, controls, and cards) rather than hand-maintained three times over. A cheaper interim step: a CI or pre-commit check that fails if `explainer.html` and `index.html` disagree on a small set of load-bearing numbers (`MC_RUNS`, gatekeeper count, `INFO_RUNS`) extracted by regex. The same kind of check would also have caught the earlier `index.html`/`evacuation-simulator.html` duplication.

## Modelling

- **The ~5/8 gatekeeper-exclusion rate is confirmed as the model's typical, intended behaviour (not a seed-42 artefact), but whether that rate is empirically *correct* for a real evacuation context is a separate, genuinely open calibration question.** No real field data exists in this project to check it against.
- **§13 of the methodology doc lists five other future extensions** (factor correlation, temporal dynamics, real data integration, a counterfactual "what if" UI) that remain undone. Of these, **factor correlation** (security and consent plausibly co-vary in real conflict) is probably the highest-value next step for ecological validity, since it's flagged as a known limitation in both the doc and the in-app §7 Assumptions section.
- **The 40% success threshold and the ±1 ordinal perturbation are both acknowledged-uncalibrated assumptions.** If empirical UNHCR/IOM displacement data (the "Real data integration" extension) ever gets pulled in, these are the two parameters most worth checking against it first.
- **Mobility-need blind spot in `vulnerability_match` (`compositeScore`, engine.js).** A group whose stated need is `mobility` is scored against the same check as a `medical` need — whether the destination's Medical capacity factor is Operational — so mobility needs have no independent representation anywhere in the model (ERUS-Paper.md §5.8, §12.7). Proposed fix: add an eighth destination factor (e.g. `accessibility`), generated and scored the same way as the existing seven, and check `group.needs === 'mobility'` against it in `compositeScore` the way `medical` is checked today. Not done yet because it changes the gatekeeper/standard weight balance and the shape of every generated destination — a modelling decision, not a mechanical fix, and one that would also require re-running every worked example in ERUS-Paper.md §6.

## Repo hygiene

- **No CI or pre-commit automation exists for any of this project's drift risks** — `explainer.html` vs. `index.html` (above), or a repeat of the earlier `index.html`/`evacuation-simulator.html` duplication. Worth a single lightweight check covering both, since the failure mode (two descriptions of the same model quietly disagreeing) is the same class of problem each time.
- **Renaming the repository away from `India-EvacSimulation`** (peer review m5) has not been done — it would break the live, citable GitHub Pages URL and any existing citations, so it's a decision for the repo owner rather than something to do unilaterally. The disambiguation note has been added to the paper's title page and Foreword instead as the lower-risk fix.

## Smaller UI notes

- The "?" explainer links open `explainer.html` in a new tab (`target="_blank"`) to preserve the live scenario state in the main tab — worth keeping that behavior if the explainer page ever gets restructured, since losing the current seed/uncertainty state on navigation would be a regression.
