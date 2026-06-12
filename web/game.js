/* Zen Geometry Dash — game engine */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var LEVELS = window.ZGD_LEVELS;
  var AUDIO = window.ZGD_AUDIO;

  // ---- physics constants (pixels, seconds) ----
  var T = 42;                 // tile size
  var GROUND_Y = 480;         // top of the floor
  var SPEED = 315;            // horizontal speed (7.5 tiles/s)
  var GRAV = 3300;            // cube gravity
  var JUMP_V = 780;           // cube jump velocity  (~3.5 tiles long, ~2.2 high)
  var MAX_FALL = 1300;
  var PAD_V = 1200;           // bounce pad (~5.2 tiles high, ~5.4 long)
  var ORB_V = 780;
  var SHIP_GRAV = 2000;
  var SHIP_THRUST = 2300;
  var SHIP_MAXV = 460;
  var PW = 36;                // player size
  var STEP = 1 / 120;         // fixed physics timestep

  // ---- character skins ----
  var SKIN_COLORS = ['#00e5ff', '#ff9a3d', '#7dff8a', '#ff5a5a', '#ffe94a', '#ff7ad9', '#b07aff', '#f1f5f9'];
  var FACE_COUNT = 5;         // classic, happy, cool, ninja, wow
  var skinColor = 0, skinFace = 0;
  try {
    skinColor = Math.min(SKIN_COLORS.length - 1, parseInt(localStorage.getItem('zgd_skin_c') || '0', 10) || 0);
    skinFace = Math.min(FACE_COUNT - 1, parseInt(localStorage.getItem('zgd_skin_f') || '0', 10) || 0);
  } catch (e) {}
  function saveSkin() {
    try {
      localStorage.setItem('zgd_skin_c', String(skinColor));
      localStorage.setItem('zgd_skin_f', String(skinFace));
    } catch (e) {}
  }
  function p2Color() { return skinColor === 1 ? SKIN_COLORS[0] : SKIN_COLORS[1]; }
  function playerColor(idx) { return idx === 0 ? SKIN_COLORS[skinColor] : p2Color(); }
  function playerFace(idx) { return idx === 0 ? skinFace : 1; }

  // ---- state ----
  var state = 'menu';         // menu | skin | play | dead | win | pause
  var levelIndex = 0;
  var level = null;           // active level data
  var tilesByCol = null;      // Map col -> tiles
  var holeSet = new Set();
  var finishX = 0, endX = 0;
  var attempts = 1;
  var deadTimer = 0;
  var hintTimer = 0;
  var zen = false;
  var twoPlayer = false;
  try { zen = localStorage.getItem('zgd_zen') === '1'; } catch (e) {}
  try { twoPlayer = localStorage.getItem('zgd_2p') === '1'; } catch (e) {}

  function makePlayer(idx) {
    return {
      idx: idx, x: 0, y: 0, vy: 0, rot: 0, mode: 'cube',
      onGround: false, prevBottom: 0, prevTop: 0,
      zenPhase: 0, squash: 0, trailTimer: 0, lastPadKey: ''
    };
  }
  var players = [makePlayer(0)];

  var camX = 0;
  var heldKey = [false, false];
  var pointerHeld = [false, false];
  var activePointers = {};
  function heldFor(i) { return heldKey[i] || pointerHeld[i]; }
  function clearInput() {
    heldKey = [false, false];
    pointerHeld = [false, false];
    activePointers = {};
  }

  var usedOrbs = {};
  var particles = [];
  var time = 0;
  var winTime = 0;
  var uiButtons = [];
  var bgShapes = [];
  var shake = 0;          // screen shake on death
  var deadFlash = 0;      // white flash on death
  var afterimages = [];   // glowing motion trail behind the players
  var mouse = { x: -1, y: -1 };
  var themeCache = null;  // per-level gradients

  for (var i = 0; i < 14; i++) {
    bgShapes.push({
      x: Math.random() * (W + 400), y: 40 + Math.random() * 360,
      s: 24 + Math.random() * 70, r: Math.random() * Math.PI,
      depth: 0.15 + Math.random() * 0.25, kind: i % 3
    });
  }

  var stars = [];
  for (var si = 0; si < 44; si++) {
    stars.push({
      x: Math.random() * (W + 200), y: Math.random() * 420,
      r: 0.7 + Math.random() * 1.7, tw: Math.random() * 6.28,
      depth: 0.04 + Math.random() * 0.1
    });
  }

  // cached vignette overlay
  var vignette = document.createElement('canvas');
  (function () {
    vignette.width = W; vignette.height = H;
    var v = vignette.getContext('2d');
    var g = v.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);
  })();

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * f)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * f)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function buildThemeCache(theme) {
    var block = ctx.createLinearGradient(0, 0, 0, T);
    block.addColorStop(0, shade(theme.block, 0.22));
    block.addColorStop(0.5, theme.block);
    block.addColorStop(1, shade(theme.block, -0.22));
    var spike = ctx.createLinearGradient(0, 0, 0, T);
    spike.addColorStop(0, '#ffffff');
    spike.addColorStop(1, '#aebacd');
    return { block: block, spike: spike };
  }

  // ---- saved progress ----
  function bestPct(i) {
    try { return parseInt(localStorage.getItem('zgd_best_' + i) || '0', 10); } catch (e) { return 0; }
  }
  function bestStars(i) {
    try { return parseInt(localStorage.getItem('zgd_stars_' + i) || '0', 10); } catch (e) { return 0; }
  }
  function saveBest(i, pct, starsWon) {
    try {
      if (pct > bestPct(i)) localStorage.setItem('zgd_best_' + i, String(pct));
      if (starsWon > bestStars(i)) localStorage.setItem('zgd_stars_' + i, String(starsWon));
    } catch (e) {}
  }

  // ---- level setup ----
  function loadLevel(i) {
    levelIndex = i;
    level = LEVELS[i];
    tilesByCol = new Map();
    for (var k = 0; k < level.tiles.length; k++) {
      var t = level.tiles[k];
      if (!tilesByCol.has(t.c)) tilesByCol.set(t.c, []);
      tilesByCol.get(t.c).push(t);
    }
    holeSet = new Set(level.holes);
    finishX = level.cols * T;
    endX = finishX + 2 * T;
    attempts = 1;
    themeCache = buildThemeCache(level.theme);
    respawn();
    state = 'play';
    hintTimer = 3.5;
    AUDIO.startMusic(level.music);
  }

  function respawn() {
    players = [];
    var n = twoPlayer ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var pl = makePlayer(i);
      pl.x = 2 * T - i * 64;       // player 2 runs just behind player 1
      pl.y = GROUND_Y - PW;
      pl.onGround = true;
      players.push(pl);
    }
    usedOrbs = {};
    afterimages = [];
    camX = players[0].x - 300;
  }

  function tileRect(t) {
    return { x: t.c * T, y: GROUND_Y - (t.h + 1) * T, w: T, h: T };
  }

  function progressPct() {
    return Math.max(0, Math.min(100, Math.round(players[0].x / endX * 100)));
  }

  function die(pl) {
    if (zen) { pl.zenPhase = 0.35; return; }
    if (state !== 'play') return;
    state = 'dead';
    deadTimer = 0.7;
    shake = 0.6;
    deadFlash = 0.3;
    saveBest(levelIndex, progressPct(), 0);
    explode(pl.x + PW / 2, pl.y + PW / 2, playerColor(pl.idx));
    explode(pl.x + PW / 2, pl.y + PW / 2, '#ffffff');
    AUDIO.death();
  }

  function winLevel() {
    state = 'win';
    winTime = 0;
    var starsWon = attempts <= 3 ? 3 : (attempts <= 10 ? 2 : 1);
    if (zen) starsWon = 1;
    saveBest(levelIndex, 100, starsWon);
    AUDIO.stopMusic();
    AUDIO.win();
  }

  // ---- physics ----
  function footSolid(pl) {
    if (zen) return true;
    var c0 = Math.floor((pl.x + 4) / T);
    var c1 = Math.floor((pl.x + PW - 4) / T);
    for (var c = c0; c <= c1; c++) if (!holeSet.has(c)) return true;
    return false;
  }

  function overlap(ax, ay, aw, ah, b) {
    return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
  }

  function updatePlayer(pl, dt) {
    var held = heldFor(pl.idx);
    pl.prevBottom = pl.y + PW;
    pl.prevTop = pl.y;
    var wasOnGround = pl.onGround;

    // horizontal
    pl.x += SPEED * dt;

    // vertical
    if (pl.mode === 'cube') {
      if (held && pl.onGround) {
        pl.vy = -JUMP_V; pl.onGround = false; AUDIO.jump();
      }
      pl.vy += GRAV * dt;
      if (pl.vy > MAX_FALL) pl.vy = MAX_FALL;
    } else { // ship
      pl.vy += (held ? -SHIP_THRUST : SHIP_GRAV) * dt;
      if (pl.vy > SHIP_MAXV) pl.vy = SHIP_MAXV;
      if (pl.vy < -SHIP_MAXV) pl.vy = -SHIP_MAXV;
    }
    pl.y += pl.vy * dt;
    pl.onGround = false;

    // ceiling of the screen (ship)
    if (pl.mode === 'ship' && pl.y < 8) { pl.y = 8; pl.vy = 0; }

    // tiles
    var c0 = Math.floor((pl.x - T) / T);
    var c1 = Math.floor((pl.x + PW + T) / T);
    for (var c = c0; c <= c1; c++) {
      var list = tilesByCol.get(c);
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var t = list[k];
        var r = tileRect(t);
        if (t.t === 'block') {
          if (!overlap(pl.x + 2, pl.y, PW - 4, PW, r)) continue;
          if (pl.vy >= 0 && pl.prevBottom <= r.y + 12) {
            pl.y = r.y - PW; pl.vy = 0; pl.onGround = true;        // land on top
          } else if (pl.mode === 'ship' && pl.vy <= 0 && pl.prevTop >= r.y + r.h - 12) {
            pl.y = r.y + r.h; pl.vy = 0;                           // ship slides under
          } else {
            die(pl);
            if (zen) break; // phase through in zen mode
          }
        } else if (t.t === 'spike' || t.t === 'spikeD') {
          var hb = t.t === 'spike'
            ? { x: r.x + 13, y: r.y + 14, w: 16, h: 28 }
            : { x: r.x + 13, y: r.y, w: 16, h: 28 };
          if (overlap(pl.x + 6, pl.y + 6, PW - 12, PW - 12, hb)) die(pl);
        } else if (t.t === 'pad') {
          var pb = { x: r.x + 4, y: r.y + r.h - 16, w: T - 8, h: 16 };
          if (overlap(pl.x, pl.y, PW, PW, pb)) {
            pl.vy = -PAD_V; pl.onGround = false;
            var key = t.c + ':' + t.h;
            if (key !== pl.lastPadKey) { AUDIO.pad(); pl.lastPadKey = key; }
          }
        } else if (t.t === 'orb') {
          var key2 = pl.idx + ':' + t.c + ':' + t.h;
          var ob = { x: r.x - 8, y: r.y - 8, w: T + 16, h: T + 16 };
          if (held && !pl.onGround && !usedOrbs[key2] &&
              overlap(pl.x, pl.y, PW, PW, ob)) {
            pl.vy = -ORB_V; usedOrbs[key2] = true;
            AUDIO.orb();
            ring(r.x + T / 2, r.y + T / 2, '#ffe94a');
          }
        } else if (t.t === 'portalShip' || t.t === 'portalCube') {
          var want = t.t === 'portalShip' ? 'ship' : 'cube';
          // trigger spans the whole column so a high-flying ship can't miss it
          var prt = { x: r.x, y: 0, w: T, h: GROUND_Y };
          if (pl.mode !== want && overlap(pl.x, pl.y, PW, PW, prt)) {
            pl.mode = want; pl.vy *= 0.3;
            AUDIO.portal();
            ring(r.x + T / 2, r.y - T / 2, want === 'ship' ? '#ff7ad9' : '#7dff8a');
          }
        }
      }
      if (state !== 'play') return;
    }

    // the floor (only counts if we were above it — no teleporting out of pits)
    if (pl.vy >= 0 && pl.y + PW >= GROUND_Y &&
        footSolid(pl) && pl.prevBottom <= GROUND_Y + 12) {
      pl.y = GROUND_Y - PW; pl.vy = 0; pl.onGround = true;
    }
    // fell into a pit
    if (pl.y + PW > GROUND_Y + 44) die(pl);

    // rotation
    if (pl.mode === 'cube') {
      if (!pl.onGround) {
        pl.rot += 7 * dt;
      } else {
        var snap = Math.round(pl.rot / (Math.PI / 2)) * (Math.PI / 2);
        pl.rot += (snap - pl.rot) * Math.min(1, 18 * dt);
      }
    } else {
      pl.rot = Math.max(-0.55, Math.min(0.55, pl.vy / SHIP_MAXV * 0.55));
    }

    // landing dust + squash
    if (!wasOnGround && pl.onGround) {
      dust(pl.x + PW / 2, pl.y + PW);
      pl.squash = 1;
    }

    if (pl.zenPhase > 0) pl.zenPhase -= dt;

    // motion-trail afterimages
    pl.trailTimer -= dt;
    if (pl.trailTimer <= 0) {
      pl.trailTimer = 0.022;
      afterimages.push({
        x: pl.x, y: pl.y, rot: pl.rot, mode: pl.mode,
        color: playerColor(pl.idx), life: 0.26, max: 0.26
      });
      if (afterimages.length > 48) afterimages.shift();
    }
  }

  function update(dt) {
    time += dt;
    for (var i = 0; i < players.length; i++) {
      updatePlayer(players[i], dt);
      if (state !== 'play') return;
    }
    camX = players[0].x - 300;
    if (players[0].x > endX) winLevel();
  }

  // ---- particles ----
  function explode(x, y, color) {
    for (var i = 0; i < 22; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 120 + Math.random() * 380;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.4, max: 0.9,
        size: 4 + Math.random() * 7, color: color, grav: 600
      });
    }
  }
  function dust(x, y) {
    for (var i = 0; i < 6; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * PW, y: y,
        vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60,
        life: 0.25, max: 0.25, size: 3 + Math.random() * 3,
        color: '#cfe8ff', grav: 300
      });
    }
  }
  function ring(x, y, color) {
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
        life: 0.3, max: 0.3, size: 4, color: color, grav: 0
      });
    }
  }
  function confetti() {
    particles.push({
      x: camX + Math.random() * W, y: -10,
      vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 120,
      life: 2.5, max: 2.5, size: 5 + Math.random() * 5,
      color: ['#ff5a5a', '#ffe94a', '#7dff8a', '#00e5ff', '#ff7ad9'][Math.floor(Math.random() * 5)],
      grav: 60
    });
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var q = particles[i];
      q.life -= dt;
      if (q.life <= 0) { particles.splice(i, 1); continue; }
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (var j = afterimages.length - 1; j >= 0; j--) {
      afterimages[j].life -= dt;
      if (afterimages[j].life <= 0) afterimages.splice(j, 1);
    }
  }

  // ---- rendering ----
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBG(theme) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bgTop);
    g.addColorStop(1, theme.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // twinkling stars, slow parallax
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (var st = 0; st < stars.length; st++) {
      var s2 = stars[st];
      var span2 = W + 200;
      var sx2 = ((s2.x - camX * s2.depth) % span2 + span2) % span2 - 100;
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 2.2 + s2.tw));
      ctx.beginPath();
      ctx.arc(sx2, s2.y, s2.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // glowing horizon band above the floor
    var hg = ctx.createLinearGradient(0, GROUND_Y - 140, 0, GROUND_Y);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(1, 'rgba(255,255,255,0.07)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, GROUND_Y - 140, W, 140);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < bgShapes.length; i++) {
      var s = bgShapes[i];
      var span = W + 400;
      var sx = ((s.x - camX * s.depth) % span + span) % span - 200;
      ctx.save();
      ctx.translate(sx, s.y);
      ctx.rotate(s.r + time * 0.1);
      if (s.kind === 0) {
        ctx.fillRect(-s.s / 2, -s.s / 2, s.s, s.s);
      } else if (s.kind === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, s.s / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -s.s / 2);
        ctx.lineTo(s.s / 2, s.s / 2);
        ctx.lineTo(-s.s / 2, s.s / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFloor(theme) {
    var c0 = Math.floor(camX / T) - 1;
    var c1 = Math.floor((camX + W) / T) + 1;
    var fg = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    fg.addColorStop(0, shade(theme.floor, 0.1));
    fg.addColorStop(1, shade(theme.floor, -0.16));
    var runStart = null;
    for (var c = c0; c <= c1 + 1; c++) {
      var solid = c <= c1 && !holeSet.has(c);
      if (solid && runStart === null) runStart = c;
      if (!solid && runStart !== null) {
        var x0 = runStart * T - camX, x1 = c * T - camX;
        ctx.fillStyle = fg;
        ctx.fillRect(x0, GROUND_Y, x1 - x0, H - GROUND_Y);
        ctx.save();
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 12;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(x0, GROUND_Y, x1 - x0, 3);
        ctx.restore();
        runStart = null;
      }
    }
    // scrolling grid lines on the floor
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (var gx = c0; gx <= c1; gx++) {
      if (holeSet.has(gx)) continue;
      var x = gx * T - camX;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 4);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTile(t, theme) {
    var r = tileRect(t);
    var x = r.x - camX, y = r.y;
    if (x < -2 * T || x > W + 2 * T) return;

    if (t.t === 'block') {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = themeCache ? themeCache.block : theme.block;
      ctx.fillRect(0, 0, T, T);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';      // glossy top
      ctx.fillRect(2, 2, T - 4, 5);
      ctx.strokeStyle = theme.blockEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(1.5, 1.5, T - 3, T - 3);
      ctx.restore();
    } else if (t.t === 'spike' || t.t === 'spikeD') {
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 9;
      ctx.fillStyle = themeCache ? themeCache.spike : '#e8edf5';
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (t.t === 'spike') {
        ctx.moveTo(2, T);
        ctx.lineTo(T / 2, 2);
        ctx.lineTo(T - 2, T);
      } else {
        ctx.moveTo(2, 0);
        ctx.lineTo(T / 2, T - 2);
        ctx.lineTo(T - 2, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (t.t === 'pad') {
      ctx.save();
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffe94a';
      roundRect(x + 4, y + T - 12, T - 8, 10, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      roundRect(x + 8, y + T - 11, T - 16, 4, 2);
      ctx.fill();
      ctx.restore();
    } else if (t.t === 'orb') {
      var pulse = 1 + Math.sin(time * 6 + t.c) * 0.12;
      var used = usedOrbs['0:' + t.c + ':' + t.h] && (!twoPlayer || usedOrbs['1:' + t.c + ':' + t.h]);
      ctx.save();
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 18;
      var og = ctx.createRadialGradient(x + T / 2 - 3, y + T / 2 - 4, 2, x + T / 2, y + T / 2, 14);
      og.addColorStop(0, '#fffbe0');
      og.addColorStop(1, '#ffd91e');
      ctx.fillStyle = used ? 'rgba(255,233,74,0.22)' : og;
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, 13 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // spinning dashed ring
      ctx.strokeStyle = used ? 'rgba(255,255,255,0.35)' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -time * 38;
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, 19 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (t.t === 'portalShip' || t.t === 'portalCube') {
      var color = t.t === 'portalShip' ? '#ff7ad9' : '#7dff8a';
      var cy = y - T + T / 2; // center of the 3-tile-tall portal
      var cx2 = x + T / 2;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      // soft glowing core
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(time * 4 + t.c);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx2, cy, 14, T * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // swirling arcs
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      var a0 = time * 2.6;
      for (var ai = 0; ai < 2; ai++) {
        ctx.beginPath();
        ctx.ellipse(cx2, cy, 14, T * 1.5, 0, a0 + ai * Math.PI, a0 + ai * Math.PI + Math.PI * 0.75);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      for (ai = 0; ai < 2; ai++) {
        ctx.beginPath();
        ctx.ellipse(cx2, cy, 9, T * 1.25, 0, -a0 * 1.4 + ai * Math.PI, -a0 * 1.4 + ai * Math.PI + Math.PI * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawFinish(theme) {
    var x = finishX - camX;
    if (x > W + 40) return;
    // striped pole with a waving flag
    for (var i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : theme.accent;
      ctx.fillRect(x, GROUND_Y - (i + 1) * 36, 8, 36);
    }
    var fy = GROUND_Y - 7 * 36;
    var wave = Math.sin(time * 7) * 4;
    ctx.save();
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(x + 8, fy);
    ctx.quadraticCurveTo(x + 34, fy + 7 + wave, x + 56, fy + 14);
    ctx.quadraticCurveTo(x + 34, fy + 21 + wave, x + 8, fy + 28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // face styles: 0 classic, 1 happy, 2 cool, 3 ninja, 4 wow
  function drawFace(face) {
    ctx.fillStyle = '#0a1a24';
    if (face === 0) {
      ctx.fillRect(-10, -8, 6, 9);
      ctx.fillRect(4, -8, 6, 9);
      roundRect(-8, 5, 16, 4, 2);
      ctx.fill();
    } else if (face === 1) {
      ctx.beginPath();
      ctx.arc(-7, -5, 3.6, 0, Math.PI * 2);
      ctx.arc(7, -5, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a1a24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 3, 8, 0.25, Math.PI - 0.25);
      ctx.stroke();
    } else if (face === 2) {
      roundRect(-13, -9, 26, 8, 3);      // sunglasses
      ctx.fill();
      ctx.fillRect(-15, -8, 30, 3);
      ctx.strokeStyle = '#0a1a24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, 7);
      ctx.lineTo(9, 5);
      ctx.stroke();
    } else if (face === 3) {
      ctx.fillRect(-15, -10, 30, 7);     // ninja band
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, -8, 5, 3);
      ctx.fillRect(5, -8, 5, 3);
      ctx.fillStyle = '#0a1a24';
      ctx.fillRect(-5, 6, 10, 3);
    } else {
      ctx.beginPath();
      ctx.arc(-7, -5, 4, 0, Math.PI * 2);
      ctx.arc(7, -5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 6, 5, 0, Math.PI * 2);  // wow mouth
      ctx.fill();
    }
  }

  function drawCube(color, face) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    roundRect(-PW / 2, -PW / 2, PW, PW, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    roundRect(-PW / 2 + 3, -PW / 2 + 3, PW - 6, PW - 6, 5);
    ctx.stroke();
    drawFace(face);
  }

  function drawAfterimages() {
    if (state === 'dead') return;
    for (var i = 0; i < afterimages.length; i++) {
      var a = afterimages[i];
      var al = Math.max(0, a.life / a.max);
      ctx.save();
      ctx.globalAlpha = al * 0.22;
      ctx.translate(a.x - camX + PW / 2, a.y + PW / 2);
      ctx.rotate(a.rot);
      ctx.fillStyle = a.color;
      var sz = PW * (0.55 + 0.45 * al);
      if (a.mode === 'cube') {
        roundRect(-sz / 2, -sz / 2, sz, sz, 6);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(sz / 2 + 4, 0);
        ctx.lineTo(-sz / 2, -sz / 2 + 4);
        ctx.lineTo(-sz / 2, sz / 2 - 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(pl) {
    if (state === 'dead') return;
    var color = playerColor(pl.idx);
    var x = pl.x - camX, y = pl.y;
    ctx.save();
    ctx.translate(x + PW / 2, y + PW / 2);
    // squash & stretch (applied in world axes, before rotation)
    if (pl.mode === 'cube') {
      if (pl.squash > 0) {
        ctx.scale(1 + 0.22 * pl.squash, 1 - 0.26 * pl.squash);
      } else if (!pl.onGround) {
        var st2 = Math.min(1, Math.abs(pl.vy) / 950);
        ctx.scale(1 - 0.1 * st2, 1 + 0.13 * st2);
      }
    }
    ctx.rotate(pl.rot);
    if (pl.zenPhase > 0) ctx.globalAlpha = 0.35;

    if (pl.mode === 'cube') {
      drawCube(color, playerFace(pl.idx));
    } else {
      // ship: little rocket
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(PW / 2 + 6, 0);
      ctx.lineTo(-PW / 2, -PW / 2 + 6);
      ctx.lineTo(-PW / 2 + 4, 0);
      ctx.lineTo(-PW / 2, PW / 2 - 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(2, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      // exhaust
      if (heldFor(pl.idx)) {
        ctx.fillStyle = '#ffe94a';
        ctx.beginPath();
        ctx.moveTo(-PW / 2 + 2, -4);
        ctx.lineTo(-PW / 2 - 10 - Math.random() * 8, 0);
        ctx.lineTo(-PW / 2 + 2, 4);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var q = particles[i];
      var a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - camX - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD(theme) {
    // progress bar
    var bw = 380, bx = (W - bw) / 2, by = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(bx, by, bw, 14, 7);
    ctx.fill();
    var pct = progressPct();
    if (pct > 0) {
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 8;
      ctx.fillStyle = theme.accent;
      roundRect(bx + 2, by + 2, Math.max(6, (bw - 4) * pct / 100), 10, 5);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pct + '%', W / 2, by + 38);

    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('Attempt ' + attempts, 16, 28);
    ctx.textAlign = 'right';
    ctx.fillText(level.name + (twoPlayer ? '  2P' : '') + (zen ? '  ☯ ZEN' : ''), W - 16, 28);

    if (hintTimer > 0) {
      ctx.globalAlpha = Math.min(1, hintTimer);
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(level.hint, W / 2, 90);
      if (twoPlayer) {
        ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
        ctx.fillText('P1: SPACE / left side — P2: ↑ / right side', W / 2, 116);
      }
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'left';
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('ESC pause · M sound · Z zen mode', 16, H - 10);
  }

  function hovered(x, y, w, h) {
    return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  }

  function button(x, y, w, h, label, action, color) {
    uiButtons.push({ x: x, y: y, w: w, h: h, action: action });
    var hov = hovered(x, y, w, h);
    ctx.save();
    if (hov) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = color || (hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)');
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = hov ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 10);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  function drawMenu() {
    uiButtons = [];
    camX = time * 60; // gentle background drift
    drawBG(LEVELS[0].theme);
    drawFloor(LEVELS[0].theme);

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = SKIN_COLORS[skinColor];
    ctx.shadowBlur = 22 + 8 * Math.sin(time * 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
    ctx.fillText('ZEN GEOMETRY DASH', W / 2, 62);
    ctx.restore();
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Jump the spikes. Ride the rockets. Reach the flag!', W / 2, 90);

    // level cards: 2 rows of 4
    var cw = 210, ch = 128, gap = 14;
    var x0 = (W - (4 * cw + 3 * gap)) / 2;
    for (var i = 0; i < LEVELS.length; i++) {
      (function (i) {
        var x = x0 + (i % 4) * (cw + gap);
        var y = 112 + Math.floor(i / 4) * (ch + 14);
        var th = LEVELS[i].theme;
        var hov = hovered(x, y, cw, ch);
        if (hov) y -= 3;
        uiButtons.push({ x: x, y: y, w: cw, h: ch, action: function () { AUDIO.click(); loadLevel(i); } });
        ctx.save();
        var g = ctx.createLinearGradient(x, y, x, y + ch);
        g.addColorStop(0, th.bgBot);
        g.addColorStop(1, th.bgTop);
        ctx.fillStyle = g;
        if (hov) {
          ctx.shadowColor = th.accent;
          ctx.shadowBlur = 16;
        }
        roundRect(x, y, cw, ch, 12);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = th.accent;
        ctx.lineWidth = hov ? 3 : 2;
        roundRect(x, y, cw, ch, 12);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = th.accent;
        ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
        ctx.fillText(String(i + 1), x + 14, y + 44);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
        ctx.fillText(LEVELS[i].name, x + 48, y + 32);

        // stars
        var st = bestStars(i);
        ctx.font = '15px sans-serif';
        var starStr = '';
        for (var s = 0; s < 3; s++) starStr += s < st ? '★' : '☆';
        ctx.fillStyle = '#ffe94a';
        ctx.fillText(starStr, x + 48, y + 52);

        var bp = bestPct(i);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(x + 14, y + 72, cw - 28, 10, 5);
        ctx.fill();
        if (bp > 0) {
          ctx.fillStyle = bp >= 100 ? '#7dff8a' : th.accent;
          roundRect(x + 14, y + 72, (cw - 28) * bp / 100, 10, 5);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '13px "Trebuchet MS", sans-serif';
        ctx.fillText(bp >= 100 ? 'COMPLETE!' : 'Best: ' + bp + '%', x + 14, y + 104);
        ctx.restore();
      })(i);
    }

    var bw = 219, bh = 44, bgap = 12;
    var bx0 = (W - (4 * bw + 3 * bgap)) / 2;
    var byy = 412;
    button(bx0, byy, bw, bh, '😎 Character', function () { AUDIO.click(); state = 'skin'; });
    button(bx0 + (bw + bgap), byy, bw, bh,
      twoPlayer ? '👥 2 Player: ON' : '👤 2 Player: OFF',
      toggle2P, twoPlayer ? 'rgba(255,154,61,0.3)' : undefined);
    button(bx0 + 2 * (bw + bgap), byy, bw, bh,
      zen ? '☯ Zen Mode: ON' : '☯ Zen Mode: OFF',
      toggleZen, zen ? 'rgba(125,255,138,0.25)' : undefined);
    button(bx0 + 3 * (bw + bgap), byy, bw, bh,
      AUDIO.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON',
      function () { AUDIO.toggleMute(); });

    ctx.textAlign = 'center';
    ctx.font = '13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('P1: SPACE / W / click · P2: ↑ / ENTER (or tap left / right half in 2-Player)', W / 2, 478);
    ctx.fillText('Hold to keep jumping · Zen Mode = no dying, just vibes · Made with ♥ for Zen', W / 2, 498);
  }

  function drawSkinScreen() {
    uiButtons = [];
    camX = time * 60;
    drawBG(LEVELS[0].theme);
    drawFloor(LEVELS[0].theme);

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = SKIN_COLORS[skinColor];
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px "Trebuchet MS", sans-serif';
    ctx.fillText('CHOOSE YOUR CUBE', W / 2, 64);
    ctx.restore();

    // big bouncing preview
    var bounce = Math.abs(Math.sin(time * 2.6));
    ctx.save();
    ctx.translate(210, 300 - bounce * 70);
    ctx.rotate(Math.sin(time * 1.6) * 0.3);
    ctx.scale(2.6, 2.6);
    drawCube(SKIN_COLORS[skinColor], skinFace);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText('Player 1', 210, 408);

    // player 2 mini preview
    ctx.save();
    ctx.translate(210, 432 + Math.sin(time * 4) * -3);
    drawCube(p2Color(), 1);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillText('Player 2 (auto)', 210, 470);

    // color swatches
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText('Color', 430, 122);
    var sw = 58, sgap = 14;
    for (var ci = 0; ci < SKIN_COLORS.length; ci++) {
      (function (ci) {
        var x = 430 + (ci % 4) * (sw + sgap);
        var y = 138 + Math.floor(ci / 4) * (sw + sgap);
        uiButtons.push({ x: x, y: y, w: sw, h: sw, action: function () { skinColor = ci; saveSkin(); AUDIO.click(); } });
        ctx.save();
        if (ci === skinColor || hovered(x, y, sw, sw)) {
          ctx.shadowColor = SKIN_COLORS[ci];
          ctx.shadowBlur = 16;
        }
        ctx.fillStyle = SKIN_COLORS[ci];
        roundRect(x, y, sw, sw, 12);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = ci === skinColor ? '#ffffff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = ci === skinColor ? 4 : 2;
        roundRect(x, y, sw, sw, 12);
        ctx.stroke();
        ctx.restore();
      })(ci);
    }

    // face picker
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText('Face', 430, 318);
    var fw = 64;
    for (var fi = 0; fi < FACE_COUNT; fi++) {
      (function (fi) {
        var x = 430 + fi * (fw + 12);
        var y = 334;
        uiButtons.push({ x: x, y: y, w: fw, h: fw, action: function () { skinFace = fi; saveSkin(); AUDIO.click(); } });
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        roundRect(x, y, fw, fw, 12);
        ctx.fill();
        ctx.strokeStyle = fi === skinFace ? '#ffffff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = fi === skinFace ? 4 : 2;
        if (hovered(x, y, fw, fw)) ctx.strokeStyle = '#ffffff';
        roundRect(x, y, fw, fw, 12);
        ctx.stroke();
        ctx.translate(x + fw / 2, y + fw / 2);
        ctx.scale(1.1, 1.1);
        drawCube(SKIN_COLORS[skinColor], fi);
        ctx.restore();
      })(fi);
    }

    button(W / 2 - 110, 444, 220, 46, '◀ Back', function () { AUDIO.click(); state = 'menu'; }, 'rgba(0,229,255,0.25)');
  }

  function toggleZen() {
    zen = !zen;
    try { localStorage.setItem('zgd_zen', zen ? '1' : '0'); } catch (e) {}
    AUDIO.click();
  }

  function toggle2P() {
    twoPlayer = !twoPlayer;
    try { localStorage.setItem('zgd_2p', twoPlayer ? '1' : '0'); } catch (e) {}
    AUDIO.click();
  }

  function drawOverlayPanel(title, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, 185);
    ctx.restore();
  }

  function drawWin() {
    uiButtons = [];
    drawScene();
    drawOverlayPanel('LEVEL COMPLETE!', '#7dff8a');

    var starsWon = attempts <= 3 ? 3 : (attempts <= 10 ? 2 : 1);
    if (zen) starsWon = 1;
    ctx.font = '52px sans-serif';
    ctx.fillStyle = '#ffe94a';
    var s = '';
    for (var i = 0; i < 3; i++) s += i < starsWon ? '★' : '☆';
    ctx.fillText(s, W / 2, 250);
    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText((zen ? 'Zen run — beautifully calm!' : 'Attempts: ' + attempts), W / 2, 292);

    var hasNext = levelIndex < LEVELS.length - 1;
    var bw = 190, bh = 50, y = 330;
    if (hasNext) {
      button(W / 2 - bw - 110, y, bw, bh, 'Replay', function () { AUDIO.click(); loadLevel(levelIndex); });
      button(W / 2 - bw / 2, y, bw, bh, 'Next Level ▶', function () { AUDIO.click(); loadLevel(levelIndex + 1); }, 'rgba(125,255,138,0.3)');
      button(W / 2 + 110, y, bw, bh, 'Menu', goMenu);
    } else {
      button(W / 2 - bw - 20, y, bw, bh, 'Replay', function () { AUDIO.click(); loadLevel(levelIndex); });
      button(W / 2 + 20, y, bw, bh, 'Menu', goMenu);
      ctx.fillStyle = '#ffe94a';
      ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
      ctx.fillText('🏆 You beat ALL the levels — you ARE the Zen Master! 🏆', W / 2, 440);
    }
  }

  function drawPause() {
    uiButtons = [];
    drawScene();
    drawOverlayPanel('PAUSED', '#00e5ff');
    var bw = 220, bh = 50;
    button(W / 2 - bw / 2, 240, bw, bh, 'Resume ▶', function () { AUDIO.click(); state = 'play'; }, 'rgba(0,229,255,0.25)');
    button(W / 2 - bw / 2, 302, bw, bh, 'Restart Level', function () { AUDIO.click(); loadLevel(levelIndex); });
    button(W / 2 - bw / 2, 364, bw, bh, zen ? '☯ Zen Mode: ON' : '☯ Zen Mode: OFF', toggleZen, zen ? 'rgba(125,255,138,0.25)' : undefined);
    button(W / 2 - bw / 2, 426, bw, bh, 'Menu', goMenu);
  }

  function goMenu() {
    AUDIO.click();
    AUDIO.stopMusic();
    particles = [];
    afterimages = [];
    holeSet = new Set(); // menu background floor has no pits
    state = 'menu';
  }

  function drawScene() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 22, (Math.random() - 0.5) * shake * 22);
    }
    drawBG(level.theme);
    var c0 = Math.floor(camX / T) - 2;
    var c1 = Math.floor((camX + W) / T) + 2;
    for (var c = c0; c <= c1; c++) {
      var list = tilesByCol.get(c);
      if (!list) continue;
      for (var k = 0; k < list.length; k++) drawTile(list[k], level.theme);
    }
    drawFinish(level.theme);
    drawFloor(level.theme);
    drawAfterimages();
    for (var pi = 0; pi < players.length; pi++) drawPlayer(players[pi]);
    drawParticles();
    ctx.restore();
    ctx.drawImage(vignette, 0, 0);
    if (deadFlash > 0) {
      ctx.globalAlpha = Math.min(0.55, deadFlash * 1.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---- main loop ----
  var lastTime = performance.now();
  var acc = 0;

  function frame(now) {
    var dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (state === 'play') {
      acc += dt;
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
        if (state !== 'play') { acc = 0; break; }
      }
      if (hintTimer > 0) hintTimer -= dt;
    } else if (state === 'dead') {
      deadTimer -= dt;
      time += dt;
      if (deadTimer <= 0) {
        attempts++;
        respawn();
        state = 'play';
      }
    } else if (state === 'win') {
      winTime += dt;
      time += dt;
      if (Math.random() < 0.4) confetti();
    } else {
      time += dt;
    }
    updateParticles(dt);
    shake = Math.max(0, shake - dt * 1.5);
    deadFlash = Math.max(0, deadFlash - dt);
    for (var pi = 0; pi < players.length; pi++) {
      players[pi].squash = Math.max(0, players[pi].squash - dt * 5);
    }

    if (state === 'menu') {
      drawMenu();
    } else if (state === 'skin') {
      drawSkinScreen();
    } else if (state === 'pause') {
      drawPause();
    } else if (state === 'win') {
      drawWin();
    } else {
      uiButtons = [];
      drawScene();
      drawHUD(level.theme);
    }

    requestAnimationFrame(frame);
  }

  // ---- input ----
  function canvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height)
    };
  }

  function recomputePointerHeld() {
    pointerHeld = [false, false];
    for (var id in activePointers) pointerHeld[activePointers[id]] = true;
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    AUDIO.unlock();
    var pos = canvasPos(e);
    for (var i = 0; i < uiButtons.length; i++) {
      var b = uiButtons[i];
      if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) {
        b.action();
        return;
      }
    }
    if (state === 'play') {
      var side = twoPlayer ? (pos.x < W / 2 ? 0 : 1) : 0;
      activePointers[e.pointerId] = side;
      recomputePointerHeld();
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    var pos = canvasPos(e);
    mouse.x = pos.x;
    mouse.y = pos.y;
  });
  window.addEventListener('pointerup', function (e) {
    delete activePointers[e.pointerId];
    recomputePointerHeld();
  });
  window.addEventListener('pointercancel', function (e) {
    delete activePointers[e.pointerId];
    recomputePointerHeld();
  });

  var keysDown = {};
  function recomputeHeldKeys() {
    var p1Keys = keysDown.Space || keysDown.KeyW;
    var p2Keys = keysDown.ArrowUp || keysDown.Enter;
    heldKey[0] = !!(p1Keys || (!twoPlayer && p2Keys));
    heldKey[1] = !!(twoPlayer && p2Keys);
  }

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    AUDIO.unlock();
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
      keysDown[e.code] = true;
      if (state === 'play') recomputeHeldKeys();
      else if (state === 'pause') state = 'play';
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state === 'play') { state = 'pause'; clearInput(); keysDown = {}; }
      else if (state === 'pause') state = 'play';
      else if (state === 'skin') state = 'menu';
    } else if (e.code === 'KeyM') {
      AUDIO.toggleMute();
    } else if (e.code === 'KeyZ') {
      toggleZen();
    } else if (e.code === 'KeyR') {
      if (state === 'play' || state === 'pause') loadLevel(levelIndex);
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Enter') {
      keysDown[e.code] = false;
      recomputeHeldKeys();
    }
  });
  window.addEventListener('blur', function () {
    keysDown = {};
  });
  window.addEventListener('blur', function () {
    clearInput();
    if (state === 'play') state = 'pause';
  });

  requestAnimationFrame(frame);
})();
