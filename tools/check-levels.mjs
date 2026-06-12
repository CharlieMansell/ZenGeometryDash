// Sanity-checks every level against the game's jump physics:
//   node tools/check-levels.mjs
//
// Rules (derived from the constants in web/game.js):
//   - a normal jump travels ~3.5 tiles and rises ~2.2 tiles
//   - spike runs: max 2 on flat ground, max 3 right after a pad
//   - pits: max 4 tiles plain, max 4 after a pad, wider needs orbs above
//   - ship tunnels: passage of at least 3 tiles everywhere
//   - ground must never rise more than 2 tiles vs the previous 4 columns
//   - the first 6 columns must be hazard-free (spawn area)
import { readFileSync } from 'fs';

eval(readFileSync(new URL('../web/levels.js', import.meta.url), 'utf8'));
const LEVELS = globalThis.ZGD_LEVELS;
const MAXH = globalThis.ZGD_MAXH;

let failures = 0;
const fail = (lvl, msg) => { failures++; console.error(`  ✗ [${lvl}] ${msg}`); };

for (const lvl of LEVELS) {
  console.log(`Checking "${lvl.name}" (${lvl.cols} columns)...`);
  const holes = new Set(lvl.holes);
  const byCol = new Map();
  for (const t of lvl.tiles) {
    if (!byCol.has(t.c)) byCol.set(t.c, []);
    byCol.get(t.c).push(t);
  }
  const at = (c, h) => (byCol.get(c) || []).find(t => t.h === h);
  const hasType = (c, type) => (byCol.get(c) || []).some(t => t.t === type);

  // ground height profile: contiguous blocks from the floor up
  const groundH = c => {
    let h = 0;
    while (at(c, h)?.t === 'block') h++;
    return h;
  };

  // spawn area must be clear
  for (let c = 0; c < 6; c++) {
    if (byCol.has(c) || holes.has(c)) fail(lvl.name, `hazard in spawn area at col ${c}`);
  }

  // spike runs on the floor (spikes under a platform don't count —
  // the player crosses those on the platform above)
  let run = 0;
  for (let c = 0; c <= lvl.cols; c++) {
    const covered = (byCol.get(c) || []).some(t => t.t === 'block' && t.h > 0);
    const isFloorSpike = at(c, 0)?.t === 'spike' && !holes.has(c) && !covered;
    if (isFloorSpike) { run++; continue; }
    if (run > 0) {
      const start = c - run;
      let padBefore = false;
      for (let b = start - 4; b < start; b++) if (hasType(b, 'pad')) padBefore = true;
      const max = padBefore ? 3 : 2;
      if (run > max) fail(lvl.name, `${run} floor spikes in a row at col ${start} (max ${max})`);
      run = 0;
    }
  }

  // pits
  let pitStart = -1;
  for (let c = 0; c <= lvl.cols; c++) {
    if (holes.has(c)) { if (pitStart < 0) pitStart = c; continue; }
    if (pitStart >= 0) {
      const w = c - pitStart;
      let padBefore = false, orbs = 0;
      for (let b = pitStart - 4; b < pitStart; b++) if (hasType(b, 'pad')) padBefore = true;
      for (let b = pitStart; b < c; b++) if (hasType(b, 'orb')) orbs++;
      const ok =
        (w <= 4 && orbs === 0 && !padBefore) ||
        (padBefore && w <= 4) ||
        (orbs >= 1 && w <= 4 + orbs * 3);
      if (!ok) fail(lvl.name, `pit of width ${w} at col ${pitStart} (orbs=${orbs}, pad=${padBefore}) not crossable`);
      pitStart = -1;
    }
  }

  // tunnels: any column whose ceiling reaches the top of the screen
  for (let c = 0; c < lvl.cols; c++) {
    if (at(c, MAXH)?.t !== 'block') continue;
    const floor = groundH(c);
    let ceil = floor;
    while (ceil <= MAXH && at(c, ceil)?.t !== 'block') ceil++;
    let gap = ceil - floor;
    if (at(c, floor)?.t === 'spike') gap--;          // spike on tunnel floor
    if (at(c, ceil - 1)?.t === 'spikeD') gap--;      // spike on tunnel ceiling
    if (gap < 3) fail(lvl.name, `tunnel passage only ${gap} tiles at col ${c} (min 3)`);
  }

  // ground rises
  for (let c = 1; c < lvl.cols; c++) {
    const h = groundH(c);
    if (h === 0) continue;
    let reachable = false;
    for (let b = Math.max(0, c - 4); b < c; b++) {
      if (groundH(b) >= h - 2 && !holes.has(b)) reachable = true;
    }
    if (!reachable) fail(lvl.name, `ground rises to ${h} at col ${c} with no launch point nearby`);
  }

  // tiles inside holes make no sense (except orbs floating above)
  for (const t of lvl.tiles) {
    if (holes.has(t.c) && t.t !== 'orb') {
      fail(lvl.name, `non-orb tile '${t.t}' inside pit at col ${t.c}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll levels pass the playability checks ✔');
