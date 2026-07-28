'use strict';

// ============================================================
// ERUS SIMULATION ENGINE
// Pure, DOM-free scoring/assignment logic shared by index.html (as a plain
// classic <script>, so these names become ordinary script-scope bindings
// available to the inline script that follows it) and by the test suite
// under tests/ (as a CommonJS module via the export guard at the bottom).
// No build step and no dependencies either way — the same file runs in
// both places unchanged.
// ============================================================

// ============================================================
// SIMULATION CONSTANTS
// ============================================================
const PARAMS = {
  MC_RUNS: 500,              // Monte Carlo iterations per (group, destination) pair
  UNC_CURVE_STEPS: 10,       // Points on uncertainty curve: 0%, 10%, … 100%

  GATEKEEPER_WEIGHT: 2,      // Gatekeepers count double
  NORMAL_WEIGHT: 1,
  GK_BLOCKED_CAP: 0.20,      // Hard readiness cap when any gatekeeper is blocked

  SCORE_OP: 1.0,
  SCORE_PART: 0.5,
  SCORE_BLOCKED: 0.0,
  SCORE_UNKNOWN_BASE: 0.30,

  W_READINESS: 0.40,
  W_CAPACITY: 0.30,
  W_PROXIMITY: 0.20,
  W_VULN: 0.10,

  SUCCESS_MIN_READINESS: 0.40,

  CAP_MIN: 200, CAP_MAX: 5000,
  DIST_MIN: 20, DIST_MAX: 400,
  SIZE_MIN: 50, SIZE_MAX: 2000,

  MAX_PERTURB_PROB: 0.85,

  // Runs per pairing in the Factor Information Value panel's counterfactual
  // re-simulation (computeInfoValue). Originally 100, well below MC_RUNS: at
  // a ~30% baseline success rate that gives each estimate a standard error
  // of roughly 5-6 percentage points, which is comparable to the deltas the
  // panel reports and can produce nonsensical negative "gains" from a
  // change (Unknown -> Operational) that can only help. Raised to match
  // MC_RUNS so the panel's ranking is trustworthy at the same resolution as
  // the rest of the tool; see BACKLOG.md.
  INFO_RUNS: 500,
};

const FACTORS = [
  { id: 'security',    label: 'Security',          short: 'SEC',  gk: true  },
  { id: 'authority',   label: 'Authority consent',  short: 'AUTH', gk: true  },
  { id: 'willingness', label: 'Willingness',        short: 'WILL', gk: true, blockedLabel: 'Unwilling' },
  { id: 'capacity',    label: 'Capacity',           short: 'CAP',  gk: false },
  { id: 'shelter',     label: 'Shelter',            short: 'SHLT', gk: false },
  { id: 'food_water',  label: 'Food & water',       short: 'F&W',  gk: false },
  { id: 'medical',     label: 'Medical capacity',   short: 'MED',  gk: false },
];
const STATUSES = ['operational', 'partial', 'blocked', 'unknown'];

const ARCHETYPES = [
  { name: 'Elderly & mobility-impaired', vuln: 5, needs: 'mobility', urgency: 'immediate' },
  { name: 'Families with children',      vuln: 4, needs: null,       urgency: 'urgent'    },
  { name: 'Unaccompanied adults',        vuln: 2, needs: null,       urgency: 'can-wait'  },
  { name: 'Wounded & medical cases',     vuln: 5, needs: 'medical',  urgency: 'immediate' },
  { name: 'Unaccompanied minors',        vuln: 5, needs: 'medical',  urgency: 'immediate' },
  { name: 'Pregnant women',             vuln: 4, needs: 'medical',  urgency: 'urgent'    },
  { name: 'Mixed general population',   vuln: 2, needs: null,       urgency: 'can-wait'  },
  { name: 'Journalists & aid workers',  vuln: 2, needs: null,       urgency: 'urgent'    },
];

const DEST_PREFIXES = ['Camp','Settlement','Hub','Centre','Station','Zone','Site','Compound'];
const DEST_NAMES    = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
                       'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa'];

// ============================================================
// SEEDED RNG — Park-Miller LCG (unchanged)
// ============================================================
class RNG {
  constructor(seed) {
    this.s = Math.max(1, Math.abs(Math.floor(seed)) % 2147483646) || 1;
  }
  next() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  int(lo, hi)   { return Math.floor(this.next() * (hi - lo + 1)) + lo; }
  pick(arr)     { return arr[this.int(0, arr.length - 1)]; }
  expo(lo, hi)  {
    const lam = 3.0;
    const t = -Math.log(1 - this.next() * (1 - Math.exp(-lam))) / lam;
    return Math.round(lo + t * (hi - lo));
  }
}

// ============================================================
// DATA GENERATION (unchanged)
// ============================================================
function generateDestinations(rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const factors = {};
    FACTORS.forEach(f => {
      const w = f.gk
        ? [0.30, 0.28, 0.24, 0.18]
        : [0.40, 0.28, 0.10, 0.22];
      const r = rng.next();
      let cum = 0, chosen = 'unknown';
      for (let s = 0; s < STATUSES.length; s++) { cum += w[s]; if (r < cum) { chosen = STATUSES[s]; break; } }
      const baseConf = chosen === 'unknown'  ? rng.next() * 0.45 + 0.05 :
                       chosen === 'blocked'  ? rng.next() * 0.35 + 0.40 :
                                              rng.next() * 0.35 + 0.60;
      factors[f.id] = { status: chosen, baseConf };
    });
    out.push({
      id: `d${i}`,
      name: `${DEST_PREFIXES[rng.int(0, DEST_PREFIXES.length-1)]} ${DEST_NAMES[i < DEST_NAMES.length ? i : rng.int(0, DEST_NAMES.length-1)]}`,
      factors,
      capacity: rng.expo(PARAMS.CAP_MIN, PARAMS.CAP_MAX),
      distance: rng.int(PARAMS.DIST_MIN, PARAMS.DIST_MAX),
    });
  }
  return out;
}

function generateGroups(rng, m) {
  const pool = [...ARCHETYPES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(m, pool.length)).map((a, i) => ({
    id: `g${i}`,
    name: a.name,
    size: rng.int(PARAMS.SIZE_MIN, PARAMS.SIZE_MAX),
    vuln: a.vuln,
    needs: a.needs,
    urgency: a.urgency,
  }));
}

// ============================================================
// READINESS SCORING (unchanged)
// ============================================================
function computeReadiness(dest, confMult, overrides) {
  let wSum = 0, wTot = 0, gkBlocked = false;
  const fScores = {};
  FACTORS.forEach(f => {
    const status = (overrides && overrides[f.id]) || dest.factors[f.id].status;
    const effConf = dest.factors[f.id].baseConf * confMult;
    const w = f.gk ? PARAMS.GATEKEEPER_WEIGHT : PARAMS.NORMAL_WEIGHT;
    let score;
    if (status === 'blocked') {
      if (f.gk) gkBlocked = true;
      score = PARAMS.SCORE_BLOCKED;
    } else if (status === 'unknown') {
      score = PARAMS.SCORE_UNKNOWN_BASE * (0.5 + 0.5 * effConf);
    } else {
      const base = status === 'operational' ? PARAMS.SCORE_OP : PARAMS.SCORE_PART;
      score = base * (0.5 + 0.5 * effConf);
    }
    fScores[f.id] = score;
    wSum += w * score;
    wTot += w;
  });
  let readiness = wTot > 0 ? wSum / wTot : 0;
  if (gkBlocked) readiness = Math.min(readiness, PARAMS.GK_BLOCKED_CAP);
  return { readiness, gkBlocked, fScores };
}

// ============================================================
// MONTE CARLO ENGINE (unchanged logic; added optional runs param)
// ============================================================
// Perturbation ordinal. `unknown` is deliberately NOT part of it: "not
// assessed" is an epistemic state, not one step worse than "blocked". When
// `unknown` sat at the end of STATUSES, a blocked gatekeeper could perturb to
// `unknown` — which scores SCORE_UNKNOWN_BASE and does not set gkBlocked — so a
// genuinely blocked/unwilling site could be counted as a Monte-Carlo success,
// evading the GK_BLOCKED_CAP hard cap and inflating reported success rates.
// Perturbation now stays inside operational <-> partial <-> blocked, and
// `unknown` neither perturbs in nor out.
const PERTURB_ORDER = ['operational', 'partial', 'blocked'];

function perturbStatus(status, effConf, rng) {
  if (status === 'unknown') return status;
  const prob = PARAMS.MAX_PERTURB_PROB * (1 - effConf);
  if (rng.next() > prob) return status;
  const idx = PERTURB_ORDER.indexOf(status);
  const dir = rng.next() < 0.5 ? -1 : 1;
  return PERTURB_ORDER[Math.max(0, Math.min(PERTURB_ORDER.length - 1, idx + dir))];
}

function monteCarlo(dest, group, confMult, seed, runs) {
  runs = (runs !== undefined) ? runs : PARAMS.MC_RUNS;
  const rng = new RNG(seed);
  let successes = 0;
  const readinessVals = [];
  for (let run = 0; run < runs; run++) {
    const ov = {};
    FACTORS.forEach(f => {
      const effConf = dest.factors[f.id].baseConf * confMult;
      ov[f.id] = perturbStatus(dest.factors[f.id].status, effConf, rng);
    });
    const { readiness, gkBlocked } = computeReadiness(dest, confMult, ov);
    readinessVals.push(readiness);
    if (readiness >= PARAMS.SUCCESS_MIN_READINESS && dest.capacity >= group.size && !gkBlocked) successes++;
  }
  const mean = readinessVals.reduce((a,b) => a+b, 0) / runs;
  const variance = readinessVals.reduce((a,b) => a + (b-mean)**2, 0) / runs;
  return { successRate: successes / runs, mean, stdDev: Math.sqrt(variance) };
}

// ============================================================
// ASSIGNMENT ALGORITHM
// Groups sorted by urgency; greedy sequential with capacity tracking.
// ============================================================
function compositeScore(dest, group, confMult) {
  const { readiness } = computeReadiness(dest, confMult);
  const capFit   = Math.min(1, dest.capacity / group.size);
  const prox     = 1 - (dest.distance / PARAMS.DIST_MAX);
  const vulnMatch = (group.needs && dest.factors.medical.status === 'operational') ? 1.0 : 0.5;
  const comp = readiness * PARAMS.W_READINESS
             + capFit   * PARAMS.W_CAPACITY
             + prox     * PARAMS.W_PROXIMITY
             + vulnMatch* PARAMS.W_VULN;
  return { comp, readiness, capFit, prox, vulnMatch };
}

function assign(destinations, groups, confMult) {
  const urgencyOrder = { 'immediate': 0, 'urgent': 1, 'can-wait': 2 };
  // Process in urgency order; MC seed uses urgency-sorted index for determinism
  const sortedGroups = [...groups].sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  const remaining = {};
  destinations.forEach(d => { remaining[d.id] = d.capacity; });

  return sortedGroups.map((group, si) => {
    const ranked = destinations.map((dest, di) => {
      const { comp, readiness, capFit, prox, vulnMatch } = compositeScore(dest, group, confMult);
      const mc = monteCarlo(dest, group, confMult, si * 1000 + di + 1);
      return { destId: dest.id, comp, readiness, capFit, prox, vulnMatch, mc };
    }).sort((a, b) => b.comp - a.comp);

    const viableRanked = ranked.filter(r => remaining[r.destId] >= group.size);
    let primary, unassigned;
    if (viableRanked.length > 0) {
      primary = viableRanked[0];
      remaining[primary.destId] -= group.size;
      unassigned = false;
    } else {
      primary = ranked[0]; // best score, but flagged unassignable
      unassigned = true;
    }

    const alt = viableRanked.length > 1 ? viableRanked[1] : null;
    const primDest = destinations.find(d => d.id === primary.destId);
    const { fScores } = computeReadiness(primDest, confMult);
    const riskFactor = FACTORS.reduce((w, f) => fScores[f.id] < fScores[w.id] ? f : w, FACTORS[0]);

    return { group, ranked, primary, alt, riskFactor, primDest, unassigned };
  });
}

// ============================================================
// INFORMATION VALUE ENGINE
// Lightweight assign (100 MC runs) used for factor-upgrade simulation.
// Seed namespace offset avoids collision with main simulation seeds.
// ============================================================
function assignForInfoValue(destinations, groups, confMult, runs, seedOffset) {
  const urgencyOrder = { 'immediate': 0, 'urgent': 1, 'can-wait': 2 };
  const sorted = [...groups].sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  const remaining = {};
  destinations.forEach(d => { remaining[d.id] = d.capacity; });

  return sorted.map((group, si) => {
    const scores = destinations.map(dest => ({
      destId: dest.id,
      dest,
      comp: compositeScore(dest, group, confMult).comp,
    })).sort((a, b) => b.comp - a.comp);

    const viable = scores.filter(s => remaining[s.destId] >= group.size);
    if (viable.length === 0) return { successRate: 0 };

    remaining[viable[0].destId] -= group.size;
    const mc = monteCarlo(viable[0].dest, group, confMult, seedOffset + si * 997 + 1, runs);
    return { successRate: mc.successRate };
  });
}

function computeInfoValue(destinations, groups, confMult) {
  const INFO_RUNS = PARAMS.INFO_RUNS;
  const BASE_SEED = 200001;

  const baseResults = assignForInfoValue(destinations, groups, confMult, INFO_RUNS, BASE_SEED);
  const baseMean = baseResults.reduce((s, r) => s + r.successRate, 0) / Math.max(1, baseResults.length);

  return FACTORS.map((f, fi) => {
    const unknownDests = destinations.filter(d => d.factors[f.id].status === 'unknown');
    if (unknownDests.length === 0) {
      return { factor: f, delta: 0, baseMean, newMean: baseMean, unknownCount: 0 };
    }
    // Upgrade all unknown instances of this factor to operational
    const modDests = destinations.map(d => {
      if (d.factors[f.id].status !== 'unknown') return d;
      return { ...d, factors: { ...d.factors, [f.id]: { ...d.factors[f.id], status: 'operational' } } };
    });
    const modResults = assignForInfoValue(modDests, groups, confMult, INFO_RUNS, BASE_SEED + (fi + 1) * 30000);
    const newMean = modResults.reduce((s, r) => s + r.successRate, 0) / Math.max(1, modResults.length);

    return { factor: f, delta: newMean - baseMean, baseMean, newMean, unknownCount: unknownDests.length };
  }).sort((a, b) => b.delta - a.delta);
}

// ============================================================
// UNCERTAINTY CURVES (unchanged)
// ============================================================
function buildCurves(destinations, groups) {
  return groups.map((group, gi) => {
    const pts = [];
    for (let lvl = 0; lvl <= PARAMS.UNC_CURVE_STEPS; lvl++) {
      const unc = lvl / PARAMS.UNC_CURVE_STEPS;
      const cm  = 1 - unc;
      // Rank by composite score among capacity-viable destinations only,
      // matching assign()'s viability filter. Without this filter, the
      // "best" destination at a given uncertainty level could be one whose
      // capacity is too small for the group — compositeScore only discounts
      // insufficient capacity via capFit, it doesn't exclude it — and
      // monteCarlo's success condition (dest.capacity >= group.size) would
      // then force a flat 0% success rate at that level regardless of
      // readiness, which can make the curve misleadingly non-monotonic when
      // a viable destination overtakes it at a higher uncertainty level.
      // Falls back to ranking all destinations only if none have enough
      // capacity for this group at all, so a point is always plotted.
      const viable = destinations.filter(d => d.capacity >= group.size);
      const candidates = viable.length > 0 ? viable : destinations;
      let bestDest = candidates[0], bestComp = -Infinity;
      candidates.forEach((d, di) => {
        const { comp } = compositeScore(d, group, cm);
        if (comp > bestComp) { bestComp = comp; bestDest = d; }
      });
      const mc = monteCarlo(bestDest, group, cm, gi * 10000 + lvl + 50000);
      pts.push({ unc, sr: mc.successRate });
    }
    return pts;
  });
}

// Node-compatible export. `module` does not exist in a browser classic
// <script>, so this line is inert there — engine.js loads as a plain script
// and PARAMS/FACTORS/RNG/etc. become ordinary script-scope bindings visible
// to the inline script that follows it in index.html.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PARAMS, FACTORS, STATUSES, ARCHETYPES, DEST_PREFIXES, DEST_NAMES,
    RNG, generateDestinations, generateGroups,
    computeReadiness, PERTURB_ORDER, perturbStatus, monteCarlo,
    compositeScore, assign, assignForInfoValue, computeInfoValue, buildCurves,
  };
}
