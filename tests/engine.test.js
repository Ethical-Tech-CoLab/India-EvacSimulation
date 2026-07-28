'use strict';

// Pins known seed -> known output for the scoring/assignment engine in
// ../engine.js, per the backlog's suggestion that computeReadiness,
// perturbStatus, monteCarlo, compositeScore, and assign are pure(ish)
// functions worth regression-testing. Zero dependencies: this runs with
// Node's built-in test runner (`node --test tests/`), nothing to install.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  PARAMS, FACTORS, RNG,
  generateDestinations, generateGroups,
  computeReadiness, perturbStatus, monteCarlo,
  compositeScore, assign, computeInfoValue,
} = require('../engine.js');

describe('RNG', () => {
  test('same seed produces the same stream', () => {
    const a = new RNG(42), b = new RNG(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    assert.deepEqual(seqA, seqB);
  });

  test('different seeds diverge', () => {
    const a = new RNG(1), b = new RNG(2);
    assert.notEqual(a.next(), b.next());
  });

  test('every value stays in [0, 1)', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      assert.ok(v >= 0 && v < 1, `next() produced ${v}, outside [0,1)`);
    }
  });
});

describe('scenario generation (seed=42, n=8, m=3)', () => {
  // Pins the exact scenario this repo's docs cite throughout
  // (README, ERUS-Paper.md 6.8-6.11, BACKLOG.md) as "seed 42, eight
  // destinations, three groups". If this test ever fails, every cited
  // number in those documents needs to be regenerated and re-checked.
  test('destination 0 is deterministically "Settlement Alpha"', () => {
    const rng = new RNG(42);
    const destinations = generateDestinations(rng, 8);
    assert.equal(destinations[0].name, 'Settlement Alpha');
    assert.equal(destinations[0].capacity, 629);
    assert.equal(destinations[0].distance, 91);
  });

  test('groups drawn in the documented order', () => {
    const rng = new RNG(42);
    generateDestinations(rng, 8); // groups are drawn from the same stream, after destinations
    const groups = generateGroups(rng, 3);
    assert.deepEqual(groups.map(g => g.name), [
      'Mixed general population',
      'Unaccompanied minors',
      'Elderly & mobility-impaired',
    ]);
  });

  test('exactly 5 of 8 destinations are gatekeeper-blocked, matching the backlog\'s "roughly five in eight"', () => {
    const rng = new RNG(42);
    const destinations = generateDestinations(rng, 8);
    const blockedCount = destinations.filter(d => computeReadiness(d, 0.7).gkBlocked).length;
    assert.equal(blockedCount, 5);
  });
});

describe('computeReadiness', () => {
  const baseDest = {
    id: 'd0',
    factors: {
      security:    { status: 'operational', baseConf: 0.9 },
      authority:   { status: 'operational', baseConf: 0.9 },
      willingness: { status: 'operational', baseConf: 0.9 },
      capacity:    { status: 'operational', baseConf: 0.9 },
      shelter:     { status: 'operational', baseConf: 0.9 },
      food_water:  { status: 'operational', baseConf: 0.9 },
      medical:     { status: 'operational', baseConf: 0.9 },
    },
  };

  test('all-operational at baseConf=0.9 scores exactly 1.0*(0.5+0.5*0.9) = 0.95', () => {
    const { readiness, gkBlocked } = computeReadiness(baseDest, 1.0);
    assert.ok(Math.abs(readiness - 0.95) < 1e-9, `expected 0.95, got ${readiness}`);
    assert.equal(gkBlocked, false);
  });

  test('a single blocked gatekeeper hard-caps readiness at GK_BLOCKED_CAP, regardless of every other factor', () => {
    const { readiness, gkBlocked } = computeReadiness(baseDest, 1.0, { security: 'blocked' });
    assert.equal(gkBlocked, true);
    assert.ok(readiness <= PARAMS.GK_BLOCKED_CAP,
      `blocked gatekeeper must cap readiness at ${PARAMS.GK_BLOCKED_CAP}, got ${readiness}`);
  });

  test('a blocked non-gatekeeper factor reduces the average but does not trip the cap', () => {
    const { readiness, gkBlocked } = computeReadiness(baseDest, 1.0, { capacity: 'blocked' });
    assert.equal(gkBlocked, false);
    assert.ok(readiness < 0.95 && readiness > PARAMS.GK_BLOCKED_CAP);
  });

  test('Blocked scores 0 regardless of confidence multiplier', () => {
    const hi = computeReadiness(baseDest, 1.0, { medical: 'blocked' });
    const lo = computeReadiness(baseDest, 0.0, { medical: 'blocked' });
    assert.equal(hi.fScores.medical, 0);
    assert.equal(lo.fScores.medical, 0);
  });

  test('Unknown scores SCORE_UNKNOWN_BASE * (0.5 + 0.5*effConf)', () => {
    const { fScores } = computeReadiness(baseDest, 1.0, { medical: 'unknown' });
    const effConf = baseDest.factors.medical.baseConf * 1.0;
    const expected = PARAMS.SCORE_UNKNOWN_BASE * (0.5 + 0.5 * effConf);
    assert.ok(Math.abs(fScores.medical - expected) < 1e-9);
  });
});

describe('perturbStatus', () => {
  test('Unknown never perturbs to anything else', () => {
    const rng = new RNG(1);
    for (let i = 0; i < 200; i++) {
      assert.equal(perturbStatus('unknown', 0.0, rng), 'unknown');
    }
  });

  test('at effective confidence 1.0, perturb probability is 0 and status never changes', () => {
    const rng = new RNG(1);
    for (let i = 0; i < 200; i++) {
      assert.equal(perturbStatus('operational', 1.0, rng), 'operational');
    }
  });
});

describe('compositeScore', () => {
  const dest = {
    id: 'd0', capacity: 1000, distance: 0,
    factors: {
      security: { status: 'operational', baseConf: 0.9 },
      authority: { status: 'operational', baseConf: 0.9 },
      willingness: { status: 'operational', baseConf: 0.9 },
      capacity: { status: 'operational', baseConf: 0.9 },
      shelter: { status: 'operational', baseConf: 0.9 },
      food_water: { status: 'operational', baseConf: 0.9 },
      medical: { status: 'operational', baseConf: 0.9 },
    },
  };

  test('capacity fit is capped at 1.0 even when capacity vastly exceeds group size', () => {
    const group = { size: 10, needs: null };
    const { capFit } = compositeScore(dest, group, 1.0);
    assert.equal(capFit, 1.0);
  });

  test('a destination at distance 0 scores full proximity', () => {
    const group = { size: 10, needs: null };
    const { prox } = compositeScore(dest, group, 1.0);
    assert.equal(prox, 1.0);
  });

  test('vulnerability match is 1.0 only when the group has a need and medical is operational', () => {
    const withNeed = compositeScore(dest, { size: 10, needs: 'medical' }, 1.0);
    const withoutNeed = compositeScore(dest, { size: 10, needs: null }, 1.0);
    assert.equal(withNeed.vulnMatch, 1.0);
    assert.equal(withoutNeed.vulnMatch, 0.5);
  });
});

describe('assign', () => {
  test('a group larger than every destination is marked unassigned, not silently placed', () => {
    const destinations = [{
      id: 'd0', capacity: 50, distance: 10,
      factors: Object.fromEntries(FACTORS.map(f => [f.id, { status: 'operational', baseConf: 0.9 }])),
    }];
    const groups = [{ id: 'g0', name: 'Too big', size: 5000, vuln: 2, needs: null, urgency: 'immediate' }];
    const [result] = assign(destinations, groups, 1.0);
    assert.equal(result.unassigned, true);
  });

  test('capacity is decremented across sequential assignments so a later group cannot double-book it', () => {
    const destinations = [{
      id: 'd0', capacity: 600, distance: 10,
      factors: Object.fromEntries(FACTORS.map(f => [f.id, { status: 'operational', baseConf: 0.9 }])),
    }];
    const groups = [
      { id: 'g0', name: 'First',  size: 400, vuln: 2, needs: null, urgency: 'immediate' },
      { id: 'g1', name: 'Second', size: 400, vuln: 2, needs: null, urgency: 'urgent' },
    ];
    const results = assign(destinations, groups, 1.0);
    const first = results.find(r => r.group.name === 'First');
    const second = results.find(r => r.group.name === 'Second');
    assert.equal(first.unassigned, false);
    assert.equal(second.unassigned, true, 'only 200 of 600 capacity remained for the second 400-person group');
  });

  test('immediate-urgency groups are processed before can-wait groups', () => {
    const destinations = [{
      id: 'd0', capacity: 100, distance: 10,
      factors: Object.fromEntries(FACTORS.map(f => [f.id, { status: 'operational', baseConf: 0.9 }])),
    }];
    const groups = [
      { id: 'g0', name: 'Can wait',  size: 100, vuln: 2, needs: null, urgency: 'can-wait' },
      { id: 'g1', name: 'Immediate', size: 100, vuln: 2, needs: null, urgency: 'immediate' },
    ];
    const results = assign(destinations, groups, 1.0);
    assert.equal(results[0].group.name, 'Immediate');
    assert.equal(results[0].unassigned, false);
    assert.equal(results[1].group.name, 'Can wait');
    assert.equal(results[1].unassigned, true);
  });
});

describe('end-to-end regression: seed=42, n=8, m=3, uncertainty=30%', () => {
  // Pins the exact predicted success rates reported in ERUS-Paper.md S6.8
  // and README.md for this scenario, generated independently against a
  // live run of index.html in headless Chrome. If this test fails, either
  // the engine changed behaviour or the paper's cited numbers are stale.
  test('primary-assignment success rates match the published worked example', () => {
    const rng = new RNG(42);
    const destinations = generateDestinations(rng, 8);
    const groups = generateGroups(rng, 3);
    const confMult = 1 - 0.30;
    const assignments = assign(destinations, groups, confMult);

    const byName = Object.fromEntries(
      assignments.map(a => [a.group.name, +a.primary.mc.successRate.toFixed(4)])
    );
    assert.deepEqual(byName, {
      'Unaccompanied minors': 0.2020,
      'Elderly & mobility-impaired': 0.4800,
      'Mixed general population': 0.1780,
    });
  });
});

describe('computeInfoValue', () => {
  test('returns one ranked entry per factor, sorted by descending delta', () => {
    const rng = new RNG(42);
    const destinations = generateDestinations(rng, 8);
    const groups = generateGroups(rng, 3);
    const ranking = computeInfoValue(destinations, groups, 0.7);
    assert.equal(ranking.length, FACTORS.length);
    for (let i = 1; i < ranking.length; i++) {
      assert.ok(ranking[i - 1].delta >= ranking[i].delta, 'ranking must be sorted by descending delta');
    }
  });

  test('a factor with zero Unknown instances in the scenario has delta 0', () => {
    const rng = new RNG(42);
    const destinations = generateDestinations(rng, 8);
    const groups = generateGroups(rng, 3);
    const ranking = computeInfoValue(destinations, groups, 0.7);
    ranking.filter(r => r.unknownCount === 0).forEach(r => {
      assert.equal(r.delta, 0);
    });
  });
});
