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

  // ---- state ----
  var state = 'menu';         // menu | play | dead | win | pause
  var levelIndex = 0;
  var level = null;           // active level data
  var tilesByCol = null;      // Map col -> tiles
  var holeSet = new Set();
  var finishX = 0, endX = 0;
  var attempts = 1;
  var deadTimer = 0;
  var hintTimer = 0;
  var zen = false;
  try { zen = localStorage.getItem('zgd_zen') === '1'; } catch (e) {}

  var p = {
    x: 0, y: 0, vy: 0, rot: 0, mode: 'cube',
    onGround: false, prevBottom: 0, prevTop: 0, zenPhase: 0
  };
  var camX = 0;
  var input = { held: false };
  var usedOrbs = {};
  var lastPadKey = '';
  var particles = [];
  var trailTimer = 0;
  var time = 0;
  var winTime = 0;
  var uiButtons = [];
  var bgShapes = [];

  for (var i = 0; i < 14; i++) {
    bgShapes.push({
      x: Math.random() * (W + 400), y: 40 + Math.random() * 360,
      s: 24 + Math.random() * 70, r: Math.random() * Math.PI,
      depth: 0.15 + Math.random() * 0.25, kind: i % 3
    });
  }

  // ---- saved progress ----
  function bestPct(i) {
    try { return parseInt(localStorage.getItem('zgd_best_' + i) || '0', 10); } catch (e) { return 0; }
  }
  function bestStars(i) {
    try { return parseInt(localStorage.getItem('zgd_stars_' + i) || '0', 10); } catch (e) { return 0; }
  }
  function saveBest(i, pct, stars) {
    try {
      if (pct > bestPct(i)) localStorage.setItem('zgd_best_' + i, String(pct));
      if (stars > bestStars(i)) localStorage.setItem('zgd_stars_' + i, String(stars));
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
    respawn();
    state = 'play';
    hintTimer = 3.5;
    AUDIO.startMusic(level.music);
  }

  function respawn() {
    p.x = 2 * T; p.y = GROUND_Y - PW; p.vy = 0; p.rot = 0;
    p.mode = 'cube'; p.onGround = true; p.zenPhase = 0;
    usedOrbs = {};
    lastPadKey = '';
    camX = p.x - 300;
  }

  function tileRect(t) {
    return { x: t.c * T, y: GROUND_Y - (t.h + 1) * T, w: T, h: T };
  }

  function progressPct() {
    return Math.max(0, Math.min(100, Math.round(p.x / endX * 100)));
  }

  function die() {
    if (zen) { p.zenPhase = 0.35; return; }
    if (state !== 'play') return;
    state = 'dead';
    deadTimer = 0.7;
    saveBest(levelIndex, progressPct(), 0);
    explode(p.x + PW / 2, p.y + PW / 2, level.theme.accent);
    explode(p.x + PW / 2, p.y + PW / 2, '#ffffff');
    AUDIO.death();
  }

  function winLevel() {
    state = 'win';
    winTime = 0;
    var stars = attempts <= 3 ? 3 : (attempts <= 10 ? 2 : 1);
    if (zen) stars = 1;
    saveBest(levelIndex, 100, stars);
    AUDIO.stopMusic();
    AUDIO.win();
  }

  // ---- physics ----
  function footSolid() {
    if (zen) return true;
    var c0 = Math.floor((p.x + 4) / T);
    var c1 = Math.floor((p.x + PW - 4) / T);
    for (var c = c0; c <= c1; c++) if (!holeSet.has(c)) return true;
    return false;
  }

  function overlap(ax, ay, aw, ah, b) {
    return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
  }

  function update(dt) {
    time += dt;
    p.prevBottom = p.y + PW;
    p.prevTop = p.y;
    var wasOnGround = p.onGround;

    // horizontal
    p.x += SPEED * dt;

    // vertical
    if (p.mode === 'cube') {
      if (input.held && p.onGround) {
        p.vy = -JUMP_V; p.onGround = false; AUDIO.jump();
      }
      p.vy += GRAV * dt;
      if (p.vy > MAX_FALL) p.vy = MAX_FALL;
    } else { // ship
      p.vy += (input.held ? -SHIP_THRUST : SHIP_GRAV) * dt;
      if (p.vy > SHIP_MAXV) p.vy = SHIP_MAXV;
      if (p.vy < -SHIP_MAXV) p.vy = -SHIP_MAXV;
    }
    p.y += p.vy * dt;
    p.onGround = false;

    // ceiling of the screen (ship)
    if (p.mode === 'ship' && p.y < 8) { p.y = 8; p.vy = 0; }

    // tiles
    var c0 = Math.floor((p.x - T) / T);
    var c1 = Math.floor((p.x + PW + T) / T);
    for (var c = c0; c <= c1; c++) {
      var list = tilesByCol.get(c);
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var t = list[k];
        var r = tileRect(t);
        if (t.t === 'block') {
          if (!overlap(p.x + 2, p.y, PW - 4, PW, r)) continue;
          if (p.vy >= 0 && p.prevBottom <= r.y + 12) {
            p.y = r.y - PW; p.vy = 0; p.onGround = true;        // land on top
          } else if (p.mode === 'ship' && p.vy <= 0 && p.prevTop >= r.y + r.h - 12) {
            p.y = r.y + r.h; p.vy = 0;                          // ship slides under
          } else {
            die();
            if (zen) break; // phase through in zen mode
          }
        } else if (t.t === 'spike' || t.t === 'spikeD') {
          var hb = t.t === 'spike'
            ? { x: r.x + 13, y: r.y + 14, w: 16, h: 28 }
            : { x: r.x + 13, y: r.y, w: 16, h: 28 };
          if (overlap(p.x + 6, p.y + 6, PW - 12, PW - 12, hb)) die();
        } else if (t.t === 'pad') {
          var pb = { x: r.x + 4, y: r.y + r.h - 16, w: T - 8, h: 16 };
          if (overlap(p.x, p.y, PW, PW, pb)) {
            p.vy = -PAD_V; p.onGround = false;
            var key = t.c + ':' + t.h;
            if (key !== lastPadKey) { AUDIO.pad(); lastPadKey = key; }
          }
        } else if (t.t === 'orb') {
          var key2 = t.c + ':' + t.h;
          var ob = { x: r.x - 8, y: r.y - 8, w: T + 16, h: T + 16 };
          if (input.held && !p.onGround && !usedOrbs[key2] &&
              overlap(p.x, p.y, PW, PW, ob)) {
            p.vy = -ORB_V; usedOrbs[key2] = true;
            AUDIO.orb();
            ring(r.x + T / 2, r.y + T / 2, '#ffe94a');
          }
        } else if (t.t === 'portalShip' || t.t === 'portalCube') {
          var want = t.t === 'portalShip' ? 'ship' : 'cube';
          // trigger spans the whole column so a high-flying ship can't miss it
          var prt = { x: r.x, y: 0, w: T, h: GROUND_Y };
          if (p.mode !== want && overlap(p.x, p.y, PW, PW, prt)) {
            p.mode = want; p.vy *= 0.3;
            AUDIO.portal();
            ring(r.x + T / 2, r.y - T / 2, want === 'ship' ? '#ff7ad9' : '#7dff8a');
          }
        }
      }
    }

    // the floor (only counts if we were above it — no teleporting out of pits)
    if (p.vy >= 0 && p.y + PW >= GROUND_Y &&
        footSolid() && p.prevBottom <= GROUND_Y + 12) {
      p.y = GROUND_Y - PW; p.vy = 0; p.onGround = true;
    }
    // fell into a pit
    if (p.y + PW > GROUND_Y + 44) die();

    // rotation
    if (p.mode === 'cube') {
      if (!p.onGround) {
        p.rot += 7 * dt;
      } else {
        var snap = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
        p.rot += (snap - p.rot) * Math.min(1, 18 * dt);
      }
    } else {
      p.rot = Math.max(-0.55, Math.min(0.55, p.vy / SHIP_MAXV * 0.55));
    }

    // landing dust
    if (!wasOnGround && p.onGround) dust(p.x + PW / 2, p.y + PW);

    if (p.zenPhase > 0) p.zenPhase -= dt;

    // trail
    trailTimer -= dt;
    if (trailTimer <= 0) {
      trailTimer = 0.025;
      particles.push({
        x: p.x + PW / 2, y: p.y + PW / 2, vx: -60, vy: 0,
        life: 0.3, max: 0.3, size: PW * 0.5, color: level.theme.accent,
        grav: 0, fadeSize: true
      });
    }

    camX = p.x - 300;

    if (p.x > endX) winLevel();
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
    ctx.fillStyle = theme.floor;
    var runStart = null;
    for (var c = c0; c <= c1 + 1; c++) {
      var solid = c <= c1 && !holeSet.has(c);
      if (solid && runStart === null) runStart = c;
      if (!solid && runStart !== null) {
        var x0 = runStart * T - camX, x1 = c * T - camX;
        ctx.fillStyle = theme.floor;
        ctx.fillRect(x0, GROUND_Y, x1 - x0, H - GROUND_Y);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(x0, GROUND_Y, x1 - x0, 3);
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
      ctx.fillStyle = theme.block;
      ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = theme.blockEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
    } else if (t.t === 'spike' || t.t === 'spikeD') {
      ctx.fillStyle = '#e8edf5';
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (t.t === 'spike') {
        ctx.moveTo(x + 2, y + T);
        ctx.lineTo(x + T / 2, y + 2);
        ctx.lineTo(x + T - 2, y + T);
      } else {
        ctx.moveTo(x + 2, y);
        ctx.lineTo(x + T / 2, y + T - 2);
        ctx.lineTo(x + T - 2, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (t.t === 'pad') {
      ctx.save();
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffe94a';
      roundRect(x + 4, y + T - 12, T - 8, 10, 5);
      ctx.fill();
      ctx.restore();
    } else if (t.t === 'orb') {
      var pulse = 1 + Math.sin(time * 6 + t.c) * 0.12;
      ctx.save();
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 16;
      ctx.fillStyle = usedOrbs[t.c + ':' + t.h] ? 'rgba(255,233,74,0.25)' : '#ffe94a';
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, 13 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, 18 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (t.t === 'portalShip' || t.t === 'portalCube') {
      var color = t.t === 'portalShip' ? '#ff7ad9' : '#7dff8a';
      var cy = y - T; // center of the 3-tile-tall portal
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(x + T / 2, cy + T / 2, 14, T * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFinish(theme) {
    var x = finishX - camX;
    if (x > W + 40) return;
    // striped pole with a flag
    for (var i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : theme.accent;
      ctx.fillRect(x, GROUND_Y - (i + 1) * 36, 8, 36);
    }
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(x + 8, GROUND_Y - 7 * 36);
    ctx.lineTo(x + 56, GROUND_Y - 7 * 36 + 14);
    ctx.lineTo(x + 8, GROUND_Y - 7 * 36 + 28);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer(theme) {
    if (state === 'dead') return;
    var x = p.x - camX, y = p.y;
    ctx.save();
    ctx.translate(x + PW / 2, y + PW / 2);
    ctx.rotate(p.rot);
    if (p.zenPhase > 0) ctx.globalAlpha = 0.35;

    if (p.mode === 'cube') {
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 12;
      ctx.fillStyle = theme.accent;
      roundRect(-PW / 2, -PW / 2, PW, PW, 7);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      roundRect(-PW / 2 + 3, -PW / 2 + 3, PW - 6, PW - 6, 5);
      ctx.stroke();
      // face
      ctx.fillStyle = '#0a1a24';
      ctx.fillRect(-10, -8, 6, 9);
      ctx.fillRect(4, -8, 6, 9);
      roundRect(-8, 5, 16, 4, 2);
      ctx.fill();
    } else {
      // ship: little rocket
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 12;
      ctx.fillStyle = theme.accent;
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
      if (input.held) {
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
      var sz = q.fadeSize ? q.size * a : q.size;
      ctx.fillRect(q.x - camX - sz / 2, q.y - sz / 2, sz, sz);
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
      ctx.fillStyle = theme.accent;
      roundRect(bx + 2, by + 2, Math.max(6, (bw - 4) * pct / 100), 10, 5);
      ctx.fill();
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
    ctx.fillText(level.name + (zen ? '  ☯ ZEN' : ''), W - 16, 28);

    if (hintTimer > 0) {
      ctx.globalAlpha = Math.min(1, hintTimer);
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(level.hint, W / 2, 90);
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'left';
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('ESC pause · M sound · Z zen mode', 16, H - 10);
  }

  function button(x, y, w, h, label, action, color) {
    uiButtons.push({ x: x, y: y, w: w, h: h, action: action });
    ctx.save();
    ctx.fillStyle = color || 'rgba(255,255,255,0.12)';
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 10);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
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

    // bouncing mascot cube
    var bounce = Math.abs(Math.sin(time * 2.4));
    var my = GROUND_Y - PW - bounce * 90;
    ctx.save();
    ctx.translate(120 + Math.sin(time * 0.7) * 30, my + PW / 2);
    ctx.rotate(time * 2);
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#00e5ff';
    roundRect(-PW / 2, -PW / 2, PW, PW, 7);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px "Trebuchet MS", sans-serif';
    ctx.fillText('ZEN GEOMETRY DASH', W / 2, 105);
    ctx.restore();
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Jump the spikes. Ride the rockets. Reach the flag!', W / 2, 140);

    // level cards
    var cw = 168, ch = 175, gap = 14;
    var x0 = (W - (LEVELS.length * cw + (LEVELS.length - 1) * gap)) / 2;
    for (var i = 0; i < LEVELS.length; i++) {
      (function (i) {
        var x = x0 + i * (cw + gap), y = 185;
        var th = LEVELS[i].theme;
        uiButtons.push({ x: x, y: y, w: cw, h: ch, action: function () { AUDIO.click(); loadLevel(i); } });
        ctx.save();
        var g = ctx.createLinearGradient(x, y, x, y + ch);
        g.addColorStop(0, th.bgBot);
        g.addColorStop(1, th.bgTop);
        ctx.fillStyle = g;
        roundRect(x, y, cw, ch, 12);
        ctx.fill();
        ctx.strokeStyle = th.accent;
        ctx.lineWidth = 2.5;
        roundRect(x, y, cw, ch, 12);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = th.accent;
        ctx.font = 'bold 42px "Trebuchet MS", sans-serif';
        ctx.fillText(String(i + 1), x + cw / 2, y + 58);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
        ctx.fillText(LEVELS[i].name, x + cw / 2, y + 92);

        var bp = bestPct(i);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(x + 16, y + 110, cw - 32, 10, 5);
        ctx.fill();
        if (bp > 0) {
          ctx.fillStyle = bp >= 100 ? '#7dff8a' : th.accent;
          roundRect(x + 16, y + 110, (cw - 32) * bp / 100, 10, 5);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '13px "Trebuchet MS", sans-serif';
        ctx.fillText(bp >= 100 ? 'COMPLETE!' : 'Best: ' + bp + '%', x + cw / 2, y + 138);

        // stars
        var st = bestStars(i);
        ctx.font = '16px sans-serif';
        var starStr = '';
        for (var s = 0; s < 3; s++) starStr += s < st ? '★' : '☆';
        ctx.fillStyle = '#ffe94a';
        ctx.fillText(starStr, x + cw / 2, y + 162);
        ctx.restore();
      })(i);
    }

    button(W / 2 - 230, 405, 220, 48,
      zen ? '☯ Zen Mode: ON' : '☯ Zen Mode: OFF',
      toggleZen, zen ? 'rgba(125,255,138,0.25)' : undefined);
    button(W / 2 + 10, 405, 220, 48,
      AUDIO.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON',
      function () { AUDIO.toggleMute(); });

    ctx.textAlign = 'center';
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('TAP / CLICK / SPACE to jump — hold to keep jumping. Zen Mode = no dying, just vibes.', W / 2, H - 14);
    ctx.fillText('Made with ♥ for Zen', W / 2, 490);
  }

  function toggleZen() {
    zen = !zen;
    try { localStorage.setItem('zgd_zen', zen ? '1' : '0'); } catch (e) {}
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

    var stars = attempts <= 3 ? 3 : (attempts <= 10 ? 2 : 1);
    if (zen) stars = 1;
    ctx.font = '52px sans-serif';
    ctx.fillStyle = '#ffe94a';
    var s = '';
    for (var i = 0; i < 3; i++) s += i < stars ? '★' : '☆';
    ctx.fillText(s, W / 2, 250);
    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText((zen ? 'Zen run — beautifully calm!' : 'Attempts: ' + attempts), W / 2, 292);

    var hasNext = levelIndex < LEVELS.length - 1;
    var bw = 190, bh = 50, y = 330;
    if (hasNext) {
      button(W / 2 - bw - 110, y, bw, bh, 'Replay', function () { AUDIO.click(); loadLevel(levelIndex); });
      button(W / 2 - bw / 2 + 0, y, bw, bh, 'Next Level ▶', function () { AUDIO.click(); loadLevel(levelIndex + 1); }, 'rgba(125,255,138,0.3)');
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
    holeSet = new Set(); // menu background floor has no pits
    state = 'menu';
  }

  function drawScene() {
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
    drawPlayer(level.theme);
    drawParticles();
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

    if (state === 'menu') {
      drawMenu();
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
    if (state === 'play') input.held = true;
  });
  window.addEventListener('pointerup', function () { input.held = false; });
  window.addEventListener('pointercancel', function () { input.held = false; });

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    AUDIO.unlock();
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state === 'play') input.held = true;
      else if (state === 'pause') state = 'play';
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state === 'play') { state = 'pause'; input.held = false; }
      else if (state === 'pause') state = 'play';
    } else if (e.code === 'KeyM') {
      AUDIO.toggleMute();
    } else if (e.code === 'KeyZ') {
      toggleZen();
    } else if (e.code === 'KeyR') {
      if (state === 'play' || state === 'pause') loadLevel(levelIndex);
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      input.held = false;
    }
  });
  window.addEventListener('blur', function () {
    input.held = false;
    if (state === 'play') state = 'pause';
  });

  requestAnimationFrame(frame);
})();
