# ERUS Methodology

**Version 1.1** — supersedes `Evacuation_Simulator_Methodology.docx` v1.0, which is retired (see [Changelog](#changelog) and [Relationship to the old .docx](#relationship-to-the-old-docx) below).

This is the authoritative source for ERUS's formulas, parameter rationale, and citations. It is checked directly against `engine.js` and `index.html`, is tracked in version control (unlike its predecessor), and is updated in the same commit as any change to the formulas it documents. If this document and the in-app Methodology accordion or `ERUS-Paper.md` ever disagree, **this document is authoritative** for the formulas; `ERUS-Paper.md` is authoritative for the worked-example numbers, since those are re-derived from a live run each time they change.

---

## 1. Readiness scoring model

Destination readiness is a weighted average of seven factor scores. Three factors — Security, Authority consent, and Willingness — are **gatekeepers** and carry double weight, reflecting that each is a non-substitutable prerequisite: a site that is physically dangerous, legally inaccessible, or whose host community has explicitly refused cannot be made viable by strong food supply or shelter alone.

Willingness was originally a standard (weight-1) factor and was promoted to gatekeeper status during development, specifically because at weight 1 a strong shelter/food/medical score could arithmetically outweigh an outright host refusal. An unwilling host is treated as equally disqualifying to a blocked checkpoint.

```
readiness = (Σ w_i × score_i) / Σ w_i

w = 2 for a gatekeeper factor (Security, Authority consent, Willingness)
w = 1 for a standard factor (Capacity, Shelter, Food & water, Medical capacity)

If any gatekeeper is Blocked:
  readiness = min(readiness, GK_BLOCKED_CAP)     # 0.20
```

| Status | Score | Rationale |
|---|---|---|
| Operational | `1.0 × (0.5 + 0.5·effConf)` | Fully functional; confidence-scaled |
| Partial | `0.5 × (0.5 + 0.5·effConf)` | Degraded function; confidence-scaled |
| Blocked | `0.0` | Non-functional regardless of confidence; a gatekeeper factor Blocked also trips the hard cap above |
| Unknown | `0.30 × (0.5 + 0.5·effConf)` | Epistemic conservatism — see Section 2 |

A factor's contribution never falls below half its status value, no matter how low confidence is: the `(0.5 + 0.5·effConf)` term is bounded at `[0.5, 1.0]`. Blocked is the one exception — it scores exactly zero regardless of confidence, on the reasoning that a reported blockage should not be discounted merely because the report is shaky.

**Unknown vs. Unwilling.** For the Willingness factor specifically, a `blocked` status displays as **"Unwilling"** rather than the generic "Blocked" (`FACTORS[2].blockedLabel` in `engine.js`) — a confirmed refusal by the host community, which is a materially different epistemic state from **"Unknown"** (willingness has simply not been assessed). Both score the same in the formula above, but only "Unwilling" is a confirmed exclusion; "Unknown" is an intelligence gap that further assessment could close. See Section 7 of `ERUS-Paper.md` for the full argument.

## 2. Uncertainty model

Uncertainty operates at two multiplicative levels: a **base confidence** per factor, generated once per destination at scenario creation and reflecting how well-assessed that particular factor is, and a global **Field Uncertainty** slider that scales every factor's confidence at once.

```
effectiveConf = baseConf × (1 − fieldUncertainty)
```

The uncertainty slider changes no fact about any destination — it changes only `fieldUncertainty`, which is applied uniformly. This is what licenses attributing any change in predicted outcome to information quality: the scenario (`state.destinations`, `state.groups`) is generated once and never regenerated when the slider moves.

**Unknown status treatment** encodes a specific epistemic distinction: a known unknown is less dangerous than an unknown unknown. A factor assessed "Unknown" with high confidence (the team is sure it doesn't know) scores higher than the same status reported with low confidence (the team isn't even sure its own ignorance is accurate):

```
score_unknown = 0.30 × (0.5 + 0.5 × effectiveConf)

effectiveConf = 1.0  →  score = 0.30   (a confident admission of ignorance)
effectiveConf = 0.0  →  score = 0.15   (an unreliable admission of ignorance)
```

## 3. Monte Carlo outcome simulation

For each (evacuee group, destination) pair, `PARAMS.MC_RUNS` (500) trials simulate the outcome distribution arising from field uncertainty. In each trial, every factor's assessed status is independently subject to a perturbation test:

```
P(perturb) = MAX_PERTURB_PROB × (1 − effectiveConf)     # MAX_PERTURB_PROB = 0.85

If perturbed, status shifts exactly one ordinal level, direction chosen at random:
  operational ↔ partial ↔ blocked

Unknown is excluded from this ordinal and never perturbs in or out — it is an
epistemic state, not one step worse than "blocked" (see engine.js's comment
on PERTURB_ORDER for why this matters: without the exclusion, a blocked
gatekeeper could perturb into "unknown", evading the gatekeeper cap).
```

A single trial counts as a success only if all three hold together:

- Readiness ≥ `SUCCESS_MIN_READINESS` (40% — see Section 8 for why this is *not* a UNHCR figure)
- Destination capacity ≥ group size
- No gatekeeper factor is Blocked in that trial

The reported success rate is the proportion of trials meeting all three; the standard deviation across trials' readiness values quantifies how volatile the prediction is — a high success rate with a high standard deviation is a fragile prediction, the same rate with a low one is a stable one.

The Factor Information Value panel (`computeInfoValue`) uses the same mechanism at `PARAMS.INFO_RUNS` (500, matching `MC_RUNS` as of this version — see [Changelog](#changelog)) to answer a counterfactual: if every Unknown instance of one factor were resolved to Operational, how much would mean success rate improve, holding everything else fixed?

## 4. Assignment algorithm

Groups are sorted by urgency (immediate → urgent → can-wait) and assigned greedily in that order. Each group is placed at the highest-composite-score destination with sufficient *remaining* capacity — capacity is decremented as groups are placed, so later groups genuinely compete for what earlier groups did not take, and a group can be left `unassigned` if every viable site has filled.

```
composite = 0.40 × readiness
          + 0.30 × capacity_fit
          + 0.20 × proximity
          + 0.10 × vulnerability_match

capacity_fit        = min(1, dest.capacity / group.size)
proximity           = 1 − (dest.distance / DIST_MAX)
vulnerability_match = 1.0  if group.needs is set AND dest's Medical capacity factor is Operational
                     = 0.5  otherwise
```

The weights encode a priority ordering: protection quality (readiness) first, physical fit second, operational burden (proximity) third, population needs fourth. Because `vulnerability_match` is checked only against the Medical capacity factor, a group whose stated need is `mobility` rather than `medical` is scored identically to one with no special need unless the destination's medical capacity happens to be Operational — there is no separate accessibility term. This is a known simplification; a proposed remedy is recorded in `ERUS-Paper.md` Section 12.7 and in `BACKLOG.md`.

**A destination's composite ranking and its Monte Carlo success rate are not the same thing**, and can diverge sharply: `capacity_fit` and `proximity` are unaffected by a gatekeeper cap, so a destination whose readiness is hard-capped at 20% can still out-rank a viable, uncapped alternative if it is close and roomy enough. `ERUS-Paper.md` Section 6.8 documents a worked case where this happens to two of three groups in the same scenario.

## 5. Synthetic data engine

All data is generated from a seeded pseudo-random number generator using the Park-Miller Linear Congruential Generator:

```
s_(n+1) = (s_n × 16807) mod 2147483647
period: 2^31 − 2 ≈ 2.1 × 10^9
source: Park & Miller (1988), CACM 31(10) — see References
```

`Math.random()` is never called anywhere in the application; every value — destination factors, capacities, distances, group draws, Monte Carlo perturbations — derives from one `RNG` instance seeded from the scenario's seed number. This is what makes a scenario, cited as `seed=42, N=8, M=3, uncertainty=30%`, exactly reproducible by anyone who opens that URL, on any machine.

Destination capacity is drawn from an exponential distribution (`λ = 3`, mapped to `[CAP_MIN, CAP_MAX]` = `[200, 5000]`), producing many small sites and few large ones — matching the real shape of humanitarian site provision, per the tool's own design rationale (this is a design choice informing what distribution shape to draw from, not a fitted parameter). Distance is drawn uniformly from `[DIST_MIN, DIST_MAX]` = `[20, 400]` km.

Factor status distributions differ for gatekeepers versus standard factors: gatekeepers are generated `[operational, partial, blocked, unknown] = [.30, .28, .24, .18]`, standard factors `[.40, .28, .10, .22]` — gatekeepers carry a higher blocked-probability weight (24% vs. 10%), reflecting that these represent the conditions most likely to be genuinely impaired in active conflict. A 500-seed sweep (`ERUS-Paper.md` Section 7.3) confirms this produces a mean gatekeeper-exclusion rate of 4.48/8 (56%) at N=8, matching the theoretical P(at least one of three gatekeepers blocked) ≈ 0.56.

## 6. Evacuee group archetypes

Groups are drawn from eight fixed archetypes; only group size is randomised per scenario (`SIZE_MIN`–`SIZE_MAX` = 50–2,000).

| Archetype | Vulnerability | Needs | Urgency |
|---|---|---|---|
| Elderly & mobility-impaired | 5 | mobility | immediate |
| Wounded & medical cases | 5 | medical | immediate |
| Unaccompanied minors | 5 | medical | immediate |
| Families with children | 4 | — | urgent |
| Pregnant women | 4 | medical | urgent |
| Journalists & aid workers | 2 | — | urgent |
| Unaccompanied adults | 2 | — | can-wait |
| Mixed general population | 2 | — | can-wait |

The `vulnerability_match` term in Section 4 rewards a destination with Operational medical capacity when a group has a special need — an attempt at operationalising proportionate protection for the more vulnerable, though see Section 4's note on the mobility-need blind spot.

## 7. Modelling assumptions and limitations

- Factor statuses are treated as statistically independent. Real-world correlation (security and authority consent plausibly co-vary) is not modelled; this is flagged as the highest-value next step for ecological validity in `ERUS-Paper.md` Section 12.2.
- The 40% readiness success threshold (`SUCCESS_MIN_READINESS`) is an **unsourced internal modelling assumption**, chosen by the authors, uncalibrated against field data. It is not drawn from the UNHCR Handbook for Emergencies or any other external source — see Section 8.
- Status perturbation shifts by exactly one ordinal level per trial. Real mis-assessments could plausibly jump multiple levels (e.g. Operational reported as Blocked); this is a deliberate simplification, not an oversight.
- Greedy urgency-ordered assignment prevents double-booking capacity but does not search for a globally optimal allocation — a group placed early can take a site that would have suited a later group better.
- Distance is a single proxy for operational burden. Road condition, checkpoints, fuel availability, and mines are not modelled at all.
- The population model is coarse: eight archetypes, three distinct vulnerability values, and a single binary medical-capacity check for special needs (Section 6).

## 8. Data sources and references

This tool uses **no real-world datasets**. Every destination, group, and factor status is generated synthetically (Section 5). The sources below inform *parameter design* — which factors exist, which are gatekeepers, where a threshold's rationale comes from — not the data itself, and none of them should be read as validating the specific numeric weights chosen.

1. Park, S. K., and K. W. Miller. "Random Number Generators: Good Ones Are Hard to Find." *Communications of the ACM*, vol. 31, no. 10, 1988, pp. 1192–1201. — the Park-Miller LCG behind the seeded random number generator (Section 5).
2. International Committee of the Red Cross. Publication on violence and the use of force, 2013. — IHL framework grounding the Security gatekeeper factor.
3. *Protocol Additional to the Geneva Conventions of 12 August 1949 (Protocol I)*, 1977, Articles 12 and 58. — Article 12 protects medical units from attack (behind the Medical capacity factor); Article 58 requires precautions against the effects of attacks on civilians (behind the Security factor).
4. Inter-Agency Standing Committee. Guidelines on host-government consent for humanitarian operations, 2007. — grounds the Authority consent gatekeeper factor.
5. Sphere Association. *The Sphere Handbook: Humanitarian Charter and Minimum Standards in Humanitarian Response.* 4th ed., Geneva, 2018. — the 15 L/person/day water and 3.5 m² covered-space figures behind the Shelter and Food & water factors.
6. United Nations High Commissioner for Refugees. *Handbook for Emergencies.* 3rd ed., Geneva, 2007. — informs *which* readiness factors are worth modelling. **It is not the source of the 40% threshold in Section 3/7.** An earlier version of this project's documentation misattributed that threshold to this handbook; the attribution was withdrawn as incorrect (see `PEER-REVIEW.md` Major issue 4 and `ERUS-Paper.md` Sections 5.10 and 8.2). Readiness is this tool's own composite construct, so no external handbook could define a minimum threshold for it.

No external source underlies the 40% `SUCCESS_MIN_READINESS` threshold itself (Section 7): it is an internal modelling assumption, chosen by the authors, and should be calibrated against field data before any applied use.

## Relationship to the old `.docx`

`Evacuation_Simulator_Methodology.docx` (v1.0) was named in the README and in-app documentation as the authoritative methodology source but was excluded from version control by `.gitignore`, meaning a reader who cloned this repository could never actually consult it — the exact problem `PEER-REVIEW.md` Major issue 3 raised. It also closed with a claim to have been "auto-generated from the simulator source code structure," which was not accurate; it was hand-authored prose that happened to track the code, and had fallen behind it in at least four respects (the MC run count, the counterfactual information-value feature, the greedy urgency-ordered assignment with capacity contention, and the Willingness → gatekeeper change) by the time that was checked.

This document replaces it. It makes no auto-generation claim, it is tracked in git so anyone who clones the repository can read it, and it is updated in the same commit as any change to the formulas it describes rather than drifting independently. The `.docx`, if it still exists in a local working copy, should be treated as historical and superseded.

## Changelog

**v1.1** (this version)
- Full rewrite as a git-tracked Markdown document, replacing the absent, stale, and falsely-labelled `.docx` v1.0.
- Documents `MC_RUNS = 500` (v1.0 documented 100).
- Documents the counterfactual Factor Information Value engine (`computeInfoValue`/`assignForInfoValue`), which v1.0 listed only as a future extension.
- Documents the greedy urgency-ordered assignment with capacity contention (v1.0 described independent, non-competing assignment).
- Documents the Willingness → gatekeeper promotion and its measured effect on the gatekeeper-exclusion rate (Section 5).
- Documents `INFO_RUNS = 500` (raised from an original 100 after a sampling-noise finding recorded in `BACKLOG.md` and `ERUS-Paper.md` Section 6.11).
- Documents the corrected `buildCurves` capacity-viability filter (`BACKLOG.md`, `ERUS-Paper.md` Section 6.10).
- Formally withdraws the UNHCR attribution for the 40% success threshold (Section 8), consistent with the correction already applied throughout `ERUS-Paper.md` and `index.html`.
