/* Cube Quest — level definitions.
 *
 * Levels are built column-by-column with a tiny DSL and rendered into a
 * character grid. Design rules that guarantee every level is beatable:
 *   - a jump rises ~2.7 tiles and clears a 3-tile gap
 *   - main-route gaps are <= 3 tiles, steps are <= 2 tiles
 *   - springs, movers and high platforms are bonus coin routes only
 *
 * Grid legend:
 *   # solid   = one-way platform   ^ spike   o coin   S spring
 *   E enemy   C checkpoint         F flag    M/V moving platform (h/v)
 */
(function (root) {
  'use strict';

  function makeBuilder(rows) {
    var ROWS = rows;
    var cols = [];   // each entry: array of ROWS chars
    var c = 0;

    function ensure(col) {
      while (cols.length <= col) {
        var arr = [];
        for (var r = 0; r < ROWS; r++) arr.push(' ');
        cols.push(arr);
      }
    }
    function put(col, row, ch) {
      if (row < 0 || row >= ROWS) return;
      ensure(col);
      cols[col][row] = ch;
    }
    // row of the surface above a default 2-high ground
    var SURFACE = ROWS - 3;

    var b = {
      // n columns of ground, opts.h = stack height (default 2);
      // item opts are local column indexes on the surface
      ground: function (n, opts) {
        opts = opts || {};
        var h = opts.h || 2;
        for (var i = 0; i < n; i++) {
          for (var k = 1; k <= h; k++) put(c + i, ROWS - k, '#');
          var sr = ROWS - h - 1;
          if (opts.spikes && opts.spikes.indexOf(i) >= 0) put(c + i, sr, '^');
          if (opts.enemy && opts.enemy.indexOf(i) >= 0) put(c + i, sr, 'E');
          if (opts.spring && opts.spring.indexOf(i) >= 0) put(c + i, sr, 'S');
          if (opts.checkpoint && opts.checkpoint.indexOf(i) >= 0) put(c + i, sr, 'C');
          if (opts.flag && opts.flag.indexOf(i) >= 0) put(c + i, sr, 'F');
          if (opts.coins && opts.coins.indexOf(i) >= 0) put(c + i, sr - 1, 'o');
        }
        c += n;
        return b;
      },

      gap: function (n) { c += n; return b; },

      // overlays placed dc columns ahead of the cursor, k tiles above the
      // default ground surface — call BEFORE the ground()/gap() they sit over
      coinsAt: function (dc, k, n) {
        for (var i = 0; i < n; i++) put(c + dc + i, SURFACE - k, 'o');
        return b;
      },
      platAt: function (dc, k, n, opts) {
        opts = opts || {};
        for (var i = 0; i < n; i++) {
          put(c + dc + i, SURFACE - k, opts.solid ? '#' : '=');
          if (opts.coins) put(c + dc + i, SURFACE - k - 1, 'o');
        }
        if (opts.spring !== undefined) put(c + dc + opts.spring, SURFACE - k - 1, 'S');
        return b;
      },
      moverAt: function (dc, k, axis) {
        put(c + dc, SURFACE - k, axis === 'v' ? 'V' : 'M');
        return b;
      },

      done: function () {
        var grid = [];
        for (var r = 0; r < ROWS; r++) {
          var row = '';
          for (var i = 0; i < cols.length; i++) row += cols[i][r];
          grid.push(row);
        }
        return grid;
      }
    };
    return b;
  }

  var LEVELS = [
    {
      name: 'Green Hills',
      rows: 14,
      theme: { bgTop: '#7ec8ff', bgBot: '#bfe9ff', ground: '#3da14d', groundEdge: '#79e08a', dirt: '#7a4a23', accent: '#ffe94a', dark: false },
      music: { bpm: 116, root: 220, mood: 1 },
      build: function (b) {
        b.coinsAt(5, 1, 3).ground(10)
          .coinsAt(0, 2, 2).gap(2)
          .ground(8, { enemy: [5] })
          .coinsAt(0, 2, 3).gap(3)
          .platAt(3, 4, 4, { coins: true })
          .ground(9, { spring: [1] })
          .ground(3, { checkpoint: [1] })
          .gap(3)
          .ground(7, { spikes: [3, 4] })
          .ground(8, { enemy: [4] })
          .coinsAt(0, 1, 3).ground(3, { h: 3 })
          .coinsAt(0, 1, 3).ground(3, { h: 4 })
          .ground(6)
          .coinsAt(0, 2, 3).gap(3)
          .ground(8, { enemy: [3] })
          .ground(10, { flag: [6] });
      }
    },
    {
      name: 'Crystal Caves',
      rows: 14,
      theme: { bgTop: '#1a1040', bgBot: '#3b2a78', ground: '#6d5bd0', groundEdge: '#b7a8ff', dirt: '#3a2d70', accent: '#ff7ad9', dark: true },
      music: { bpm: 122, root: 196, mood: 2 },
      build: function (b) {
        b.ground(8)
          .coinsAt(0, 2, 3).gap(3)
          .ground(6, { spikes: [3, 4] })
          .platAt(2, 3, 3, { coins: true })
          .ground(8, { enemy: [5] })
          .ground(2)
          .ground(5, { spikes: [1, 2, 3] })   // spikes bridged by a platform
          .platAt(-5, 1, 5)
          .ground(4, { checkpoint: [2] })
          .coinsAt(1, 2, 2).gap(3)
          .ground(6, { enemy: [2] })
          .coinsAt(0, 1, 2).ground(2, { h: 3 })
          .ground(6, { spikes: [2, 3], h: 3 })
          .platAt(-4, 3, 3, { coins: true })
          .ground(4, { h: 2 })
          .gap(3)
          .ground(7, { enemy: [2, 5] })
          .ground(3, { checkpoint: [1] })
          .ground(6, { spikes: [1, 2] })
          .coinsAt(0, 3, 4).ground(4)
          .ground(9, { flag: [5] });
      }
    },
    {
      name: 'Sky Islands',
      rows: 16,
      theme: { bgTop: '#2563eb', bgBot: '#93c5fd', ground: '#e8edf5', groundEdge: '#ffffff', dirt: '#9db4d0', accent: '#ffe94a', dark: false },
      music: { bpm: 126, root: 247, mood: 0 },
      build: function (b) {
        b.ground(8)
          .coinsAt(0, 2, 3).gap(3)
          .ground(5)
          .coinsAt(0, 3, 2).gap(3)
          .ground(4, { enemy: [2] })
          .coinsAt(1, 2, 2).gap(3)
          .ground(5, { checkpoint: [2] })
          .moverAt(3, 2, 'h').gap(3)          // mover is a bonus shortcut —
          .ground(2).gap(3)                   // island-hopping works too
          .ground(5)
          .platAt(1, 4, 3, { coins: true })
          .ground(6, { spring: [2] })
          .coinsAt(0, 2, 3).gap(3)
          .ground(4, { h: 3 })
          .gap(3)
          .ground(4, { h: 4, enemy: [2] })
          .gap(2)
          .ground(5, { h: 2, checkpoint: [2] })
          .moverAt(2, 3, 'v').gap(3)
          .ground(2).gap(2)
          .ground(4)
          .coinsAt(0, 3, 4).gap(3)
          .ground(5, { enemy: [2] })
          .ground(9, { flag: [5] });
      }
    },
    {
      name: 'Lava Works',
      rows: 14,
      theme: { bgTop: '#3a0a05', bgBot: '#8a2a10', ground: '#5a5a66', groundEdge: '#9a9aaa', dirt: '#2d2d35', accent: '#ff9a3d', dark: true },
      music: { bpm: 134, root: 175, mood: 4 },
      build: function (b) {
        b.ground(8)
          .ground(6, { spikes: [2, 3] })
          .coinsAt(0, 2, 3).gap(3)
          .ground(7, { enemy: [4] })
          .ground(6, { spikes: [1, 2] })
          .ground(6, { spikes: [3, 4] })
          .ground(3, { checkpoint: [1] })
          .platAt(3, 3, 3, { coins: true })
          .ground(9, { spikes: [2, 3, 4, 5, 6] })  // spike lake with platform
          .platAt(-7, 2, 2)
          .coinsAt(0, 2, 2).gap(3)
          .ground(2, { h: 3 })
          .ground(5, { h: 3, spikes: [1, 2] })
          .ground(4, { h: 2, enemy: [2] })
          .ground(3, { checkpoint: [1] })
          .coinsAt(0, 2, 2).gap(2)
          .ground(5, { spikes: [2] })
          .coinsAt(0, 2, 2).gap(3)
          .ground(6, { enemy: [1, 4] })
          .coinsAt(1, 3, 4).ground(6, { spikes: [1, 4] })
          .ground(9, { flag: [5] });
      }
    }
  ];

  for (var i = 0; i < LEVELS.length; i++) {
    var b = makeBuilder(LEVELS[i].rows);
    LEVELS[i].build(b);
    LEVELS[i].grid = b.done();
  }

  root.ZP_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
