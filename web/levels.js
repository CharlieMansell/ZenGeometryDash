/* Zen Geometry Dash — level definitions.
 *
 * Levels are built with a tiny builder DSL instead of ASCII art so that
 * spacing is explicit and easy to sanity-check against the jump physics:
 *   - a jump travels ~3.5 tiles and rises ~2.2 tiles
 *   - max double spikes on flat ground (triples only after a pad)
 *   - pits up to 4 tiles are jumpable; wider ones need orbs or a pad
 *   - ship corridors need a gap of at least 4 tiles
 *
 * Coordinates: c = column (tile), h = height in tiles above the floor
 * (h=0 sits on the floor). Tile types:
 *   block, spike (up), spikeD (down), pad, orb, portalShip, portalCube
 */
(function (root) {
  'use strict';

  var MAXH = 10; // tallest usable tile slot (fits on screen)

  function makeBuilder() {
    var tiles = [];
    var holes = [];
    var c = 0;

    function add(col, h, t) { tiles.push({ c: col, h: h, t: t }); }

    var b = {
      // n empty, flat floor columns
      flat: function (n) { c += n; return b; },

      // n spikes in a row on the floor
      spikes: function (n) {
        for (var i = 0; i < n; i++) add(c + i, 0, 'spike');
        c += n; return b;
      },

      // a hole in the floor, n columns wide
      pit: function (n) {
        for (var i = 0; i < n; i++) holes.push(c + i);
        c += n; return b;
      },

      // solid box w wide and hgt tall; opts.spikes = local column
      // indexes that get a spike on top of the box
      box: function (w, hgt, opts) {
        for (var i = 0; i < w; i++) {
          for (var h = 0; h < hgt; h++) add(c + i, h, 'block');
          if (opts && opts.spikes && opts.spikes.indexOf(i) >= 0) {
            add(c + i, hgt, 'spike');
          }
        }
        c += w; return b;
      },

      // floating one-tile-thick platform at height h.
      // opts.under = 'spikes' puts spikes on the ground beneath it,
      // opts.spikes = local indexes that get a spike on the platform.
      platform: function (w, h, opts) {
        for (var i = 0; i < w; i++) {
          add(c + i, h, 'block');
          if (opts && opts.under === 'spikes') add(c + i, 0, 'spike');
          if (opts && opts.spikes && opts.spikes.indexOf(i) >= 0) {
            add(c + i, h + 1, 'spike');
          }
        }
        c += w; return b;
      },

      // bounce pad on the floor
      pad: function () { add(c, 0, 'pad'); c += 1; return b; },

      // floating jump orb at height h, placed dc columns ahead of the
      // cursor WITHOUT advancing (so it can hang over a pit)
      orbAt: function (dc, h) { add(c + dc, h, 'orb'); return b; },

      // ship corridor: solid floor raise (floorH tiles) and a ceiling
      // leaving a gap of gapH tiles. opts.up / opts.down = local column
      // indexes with spikes on the corridor floor / ceiling.
      tunnel: function (w, floorH, gapH, opts) {
        for (var i = 0; i < w; i++) {
          var h;
          for (h = 0; h < floorH; h++) add(c + i, h, 'block');
          for (h = floorH + gapH; h <= MAXH; h++) add(c + i, h, 'block');
          if (opts && opts.up && opts.up.indexOf(i) >= 0) {
            add(c + i, floorH, 'spike');
          }
          if (opts && opts.down && opts.down.indexOf(i) >= 0) {
            add(c + i, floorH + gapH - 1, 'spikeD');
          }
        }
        c += w; return b;
      },

      // gamemode portal (kind: 'ship' or 'cube'), 3 tiles tall from h
      portal: function (kind, h) {
        add(c, h, kind === 'ship' ? 'portalShip' : 'portalCube');
        c += 3; return b;
      },

      done: function () { return { tiles: tiles, holes: holes, cols: c }; }
    };
    return b;
  }

  var LEVELS = [
    {
      name: 'First Bounce',
      hint: 'Tap or press SPACE to jump!',
      theme: { bgTop: '#0b1c3a', bgBot: '#1c4a8a', block: '#2e6fd6', blockEdge: '#9cc6ff', accent: '#00e5ff', floor: '#10254d' },
      music: { bpm: 112, root: 220, mood: 0 },
      build: function (b) {
        b.flat(10).spikes(1)
          .flat(8).spikes(1)
          .flat(7).spikes(1)
          .flat(7).box(3, 1)
          .flat(6).spikes(1)
          .flat(6).spikes(2)
          .flat(8).box(2, 1).flat(2).box(2, 1)
          .flat(8).spikes(2)
          .flat(7).pad().pit(3)
          .flat(8).spikes(1)
          .flat(6).spikes(2)
          .flat(12);
      }
    },
    {
      name: 'Spike Garden',
      hint: 'Tap while touching a yellow orb to jump mid-air!',
      theme: { bgTop: '#0c2a16', bgBot: '#1f6b35', block: '#2f9e4f', blockEdge: '#a8f0b8', accent: '#ffe94a', floor: '#103a1d' },
      music: { bpm: 120, root: 196, mood: 1 },
      build: function (b) {
        b.flat(8).spikes(1)
          .flat(6).spikes(2)
          .flat(6).spikes(2)
          .flat(6).platform(4, 1, { under: 'spikes' })
          .flat(6).spikes(2)
          .flat(5).spikes(2)
          .flat(6).orbAt(2, 2).orbAt(4, 2).pit(7)
          .flat(7).spikes(2)
          .flat(5).spikes(2)
          .flat(6).pad().spikes(3)
          .flat(7).spikes(1)
          .flat(5).spikes(2)
          .flat(6).spikes(1)
          .flat(12);
      }
    },
    {
      name: 'Sky Surfer',
      hint: 'In ship mode, HOLD to fly up, release to dive!',
      theme: { bgTop: '#251040', bgBot: '#6a2d9e', block: '#9b4fd6', blockEdge: '#e3bcff', accent: '#ff7ad9', floor: '#33124f' },
      music: { bpm: 126, root: 233, mood: 2 },
      build: function (b) {
        b.flat(8).spikes(1)
          .flat(6).spikes(2)
          .flat(6).spikes(2)
          .flat(7).portal('ship', 0)
          .flat(3)
          .tunnel(12, 0, 7, { up: [5, 9] })
          .tunnel(12, 0, 6, { down: [3, 8] })
          .tunnel(12, 0, 5, { up: [4], down: [9] })
          .tunnel(14, 0, 5, { up: [3, 10], down: [6] })
          .flat(2).portal('cube', 0)
          .flat(4).spikes(2)
          .flat(6).spikes(1)
          .flat(6).spikes(2)
          .flat(12);
      }
    },
    {
      name: 'Block Party',
      hint: 'Jump on blocks — but never into their sides!',
      theme: { bgTop: '#3a1505', bgBot: '#9e4a12', block: '#e07020', blockEdge: '#ffd9a8', accent: '#ffe94a', floor: '#4f2208' },
      music: { bpm: 132, root: 175, mood: 3 },
      build: function (b) {
        b.flat(8).spikes(2)
          .flat(5).spikes(2)
          .flat(5).spikes(2)
          .flat(6).box(2, 1).spikes(2).box(2, 1).spikes(2).box(2, 2)
          .flat(7).pit(4)
          .flat(4).pit(4)
          .flat(6).pad().spikes(3)
          .flat(6).pad().spikes(3)
          .flat(7).platform(6, 1, { under: 'spikes', spikes: [3] })
          .flat(6).orbAt(2, 2).orbAt(4, 2).pit(6)
          .flat(6).spikes(2)
          .flat(4).spikes(2)
          .flat(4).spikes(2)
          .flat(12);
      }
    },
    {
      name: 'Zen Master',
      hint: 'Everything at once. Stay calm — you are Zen!',
      theme: { bgTop: '#2d0515', bgBot: '#8a1240', block: '#d6306e', blockEdge: '#ffb3cf', accent: '#00e5ff', floor: '#42081f' },
      music: { bpm: 140, root: 208, mood: 4 },
      build: function (b) {
        b.flat(8).spikes(2)
          .flat(4).spikes(2)
          .flat(4).spikes(2)
          .flat(6).box(2, 1).box(2, 2).box(2, 3)
          .pit(3)
          .flat(5).spikes(2)
          .flat(5).pad().pit(4)
          .flat(5).portal('ship', 0)
          .flat(3)
          .tunnel(10, 0, 5, { up: [4], down: [7] })
          .tunnel(10, 0, 4, { up: [3, 8] })
          .tunnel(12, 0, 4, { down: [2, 7], up: [5] })
          .flat(2).portal('cube', 0)
          .flat(4).spikes(2)
          .flat(4).orbAt(2, 2).orbAt(4, 2).orbAt(6, 2).pit(9)
          .flat(5).spikes(2)
          .flat(4).platform(5, 1, { under: 'spikes', spikes: [2] })
          .flat(5).pad().spikes(3)
          .flat(5).spikes(2)
          .flat(3).spikes(2)
          .flat(14);
      }
    }
  ];

  // Build tile data for every level once, up front.
  for (var i = 0; i < LEVELS.length; i++) {
    var b = makeBuilder();
    LEVELS[i].build(b);
    var data = b.done();
    LEVELS[i].tiles = data.tiles;
    LEVELS[i].holes = data.holes;
    LEVELS[i].cols = data.cols;
  }

  root.ZGD_LEVELS = LEVELS;
  root.ZGD_MAXH = MAXH;
})(typeof window !== 'undefined' ? window : globalThis);
