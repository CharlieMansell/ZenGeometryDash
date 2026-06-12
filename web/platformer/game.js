/* Cube Quest — co-op platformer engine (part of Zen's Games) */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var LEVELS = window.ZP_LEVELS;
  var AUDIO = window.ZGD_AUDIO;
  var SKINS = window.ZG_SKINS;

  // ---- physics constants (pixels, seconds) ----
  var TILE = 40;
  var RUN = 250;              // top run speed
  var ACCEL = 1900;
  var FRICTION = 1700;
  var GRAV = 2500;
  var JUMP_V = 740;           // rises ~2.7 tiles, clears a 3-tile gap
  var MAX_FALL = 1000;
  var SPRING_V = 1250;
  var STOMP_V = 460;
  var COYOTE = 0.09;
  var BUFFER = 0.12;
  var PW = 32, PH = 32;       // player size
  var STEP = 1 / 120;

  // ---- state ----
  var state = 'menu';         // menu | skin | play | win | pause
  var levelIndex = 0;
  var level = null;
  var grid = [];              // rows of strings: '#', '=', '^' only
  var ROWS = 0, COLS = 0, levelW = 0, levelH = 0;
  var coins = [], enemies = [], springs = [], checkpoints = [], movers = [];
  var flag = null;
  var spawn = { x: 60, y: 0 };
  var coinsGot = 0, coinsTotal = 0, deaths = 0;
  var hintTimer = 0;
  var twoPlayer = false;
  var editingPlayer = 0;
  try { twoPlayer = localStorage.getItem('zp_2p') === '1'; } catch (e) {}

  var players = [];
  var camX = 0, camY = 0;
  var particles = [];
  var time = 0;
  var uiButtons = [];
  var mouse = { x: -1, y: -1 };
  var shake = 0;

  // ---- saved progress ----
  function readNum(key) { try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { return 0; } }
  function bestCoins(i) { return readNum('zp_coins_' + i); }
  function bestStars(i) { return readNum('zp_stars_' + i); }
  function isDone(i) { try { return localStorage.getItem('zp_done_' + i) === '1'; } catch (e) { return false; } }
  function saveWin(i, c, s) {
    try {
      localStorage.setItem('zp_done_' + i, '1');
      if (c > bestCoins(i)) localStorage.setItem('zp_coins_' + i, String(c));
      if (s > bestStars(i)) localStorage.setItem('zp_stars_' + i, String(s));
    } catch (e) {}
  }

  // ---- vignette ----
  var vignette = document.createElement('canvas');
  (function () {
    vignette.width = W; vignette.height = H;
    var v = vignette.getContext('2d');
    var g = v.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);
  })();

  var clouds = [];
  for (var i = 0; i < 12; i++) {
    clouds.push({ x: Math.random() * 2000, y: 20 + Math.random() * 300, s: 30 + Math.random() * 60, d: 0.1 + Math.random() * 0.2 });
  }

  // ---- input ----
  var keysDown = {};
  function inputFor(idx) {
    var oneP = !twoPlayer;
    var left, right, jump;
    if (idx === 0) {
      left = keysDown.KeyA || (oneP && keysDown.ArrowLeft);
      right = keysDown.KeyD || (oneP && keysDown.ArrowRight);
      jump = keysDown.KeyW || keysDown.Space || (oneP && (keysDown.ArrowUp || keysDown.Enter));
    } else {
      left = keysDown.ArrowLeft;
      right = keysDown.ArrowRight;
      jump = keysDown.ArrowUp || keysDown.Enter;
    }
    return { left: !!left, right: !!right, jump: !!jump };
  }
  function jumpKeyOwner(code) {
    if (code === 'KeyW' || code === 'Space') return 0;
    if (code === 'ArrowUp' || code === 'Enter') return twoPlayer ? 1 : 0;
    return -1;
  }

  // ---- level setup ----
  function tileAt(c, r) {
    if (c < 0 || r < 0 || r >= ROWS || c >= COLS) return (c < 0 || c >= COLS) ? '#' : ' ';
    return grid[r].charAt(c) || ' ';
  }

  function loadLevel(i) {
    levelIndex = i;
    level = LEVELS[i];
    ROWS = level.rows;
    var src = level.grid;
    COLS = src[0].length;
    levelW = COLS * TILE;
    levelH = ROWS * TILE;

    coins = []; enemies = []; springs = []; checkpoints = []; movers = [];
    flag = null;
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = '';
      for (var c = 0; c < COLS; c++) {
        var ch = src[r].charAt(c) || ' ';
        var x = c * TILE, y = r * TILE;
        if (ch === 'o') { coins.push({ x: x + TILE / 2, y: y + TILE / 2, got: false }); ch = ' '; }
        else if (ch === 'E') { enemies.push({ x: x + 4, y: y + TILE - 32, vx: -55, vy: 0, w: 32, h: 32, dead: false, squash: 0 }); ch = ' '; }
        else if (ch === 'S') { springs.push({ x: x, y: y, anim: 0 }); ch = ' '; }
        else if (ch === 'C') { checkpoints.push({ x: x, y: y, on: false }); ch = ' '; }
        else if (ch === 'F') { flag = { x: x, y: y }; ch = ' '; }
        else if (ch === 'M') { movers.push({ baseX: x, baseY: y, x: x, y: y, w: 80, h: 14, axis: 'h', range: 100, phase: Math.random() * 6 }); ch = ' '; }
        else if (ch === 'V') { movers.push({ baseX: x, baseY: y, x: x, y: y, w: 80, h: 14, axis: 'v', range: 80, phase: Math.random() * 6 }); ch = ' '; }
        row += ch;
      }
      grid.push(row);
    }
    coinsTotal = coins.length;
    coinsGot = 0;
    deaths = 0;

    // spawn on top of the first ground column
    var sr = 0;
    while (sr < ROWS && tileAt(2, sr) !== '#') sr++;
    spawn = { x: 1.2 * TILE, y: sr * TILE - PH - 2 };

    players = [];
    var n = twoPlayer ? 2 : 1;
    for (var p = 0; p < n; p++) players.push(makePlayer(p));

    camX = 0;
    camY = Math.max(0, levelH - H);
    particles = [];
    state = 'play';
    hintTimer = 4;
    AUDIO.startMusic(level.music);
  }

  function makePlayer(idx) {
    return {
      idx: idx,
      x: spawn.x + idx * 44, y: spawn.y,
      vx: 0, vy: 0,
      onGround: false, coyote: 0, jumpBuffer: 0,
      dead: false, respawnT: 0, invuln: 0,
      cp: { x: spawn.x + idx * 44, y: spawn.y },
      squash: 0, face: 1, wasOnGround: false,
      stepDust: 0, ride: null
    };
  }

  // ---- physics helpers ----
  function solidAt(c, r) { return tileAt(c, r) === '#'; }

  function collideX(pl) {
    var c0 = Math.floor(pl.x / TILE), c1 = Math.floor((pl.x + PW - 1) / TILE);
    var r0 = Math.floor(pl.y / TILE), r1 = Math.floor((pl.y + PH - 1) / TILE);
    for (var r = r0; r <= r1; r++) {
      if (pl.vx > 0 && solidAt(c1, r)) { pl.x = c1 * TILE - PW; pl.vx = 0; }
      else if (pl.vx < 0 && solidAt(c0, r)) { pl.x = (c0 + 1) * TILE; pl.vx = 0; }
      c0 = Math.floor(pl.x / TILE); c1 = Math.floor((pl.x + PW - 1) / TILE);
    }
  }

  function collideY(pl, prevBottom) {
    var c0 = Math.floor(pl.x / TILE), c1 = Math.floor((pl.x + PW - 1) / TILE);
    if (pl.vy >= 0) {
      var r = Math.floor((pl.y + PH - 1) / TILE);
      for (var c = c0; c <= c1; c++) {
        var ch = tileAt(c, r);
        var top = r * TILE;
        if (ch === '#' || (ch === '=' && prevBottom <= top + 6)) {
          pl.y = top - PH; pl.vy = 0; pl.onGround = true;
          return;
        }
      }
    } else {
      var r2 = Math.floor(pl.y / TILE);
      for (var c2 = c0; c2 <= c1; c2++) {
        if (solidAt(c2, r2)) {
          pl.y = (r2 + 1) * TILE; pl.vy = 0;
          return;
        }
      }
    }
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function killPlayer(pl) {
    if (pl.dead || pl.invuln > 0) return;
    pl.dead = true;
    pl.respawnT = 1.0;
    deaths++;
    shake = 0.4;
    explode(pl.x + PW / 2, pl.y + PH / 2, SKINS.get(pl.idx).color);
    AUDIO.death();
  }

  function winLevel() {
    state = 'win';
    var stars = coinsGot >= coinsTotal ? 3 : (coinsGot >= coinsTotal * 0.6 ? 2 : 1);
    saveWin(levelIndex, coinsGot, stars);
    AUDIO.stopMusic();
    AUDIO.win();
  }

  // ---- update ----
  function updatePlayer(pl, dt) {
    if (pl.dead) {
      pl.respawnT -= dt;
      if (pl.respawnT <= 0) {
        pl.x = pl.cp.x; pl.y = pl.cp.y;
        pl.vx = 0; pl.vy = 0;
        pl.dead = false;
        pl.invuln = 1.5;
      }
      return;
    }
    if (pl.invuln > 0) pl.invuln -= dt;

    var inp = inputFor(pl.idx);
    var prevBottom = pl.y + PH;

    // horizontal
    var target = (inp.right ? RUN : 0) - (inp.left ? RUN : 0);
    if (target !== 0) {
      pl.vx += (target > pl.vx ? 1 : -1) * ACCEL * dt;
      if (target > 0) { if (pl.vx > target) pl.vx = target; }
      else { if (pl.vx < target) pl.vx = target; }
      pl.face = target > 0 ? 1 : -1;
    } else {
      var f = FRICTION * dt;
      if (pl.vx > f) pl.vx -= f;
      else if (pl.vx < -f) pl.vx += f;
      else pl.vx = 0;
    }

    // jumping: coyote time + jump buffering + variable height
    if (pl.onGround) pl.coyote = COYOTE;
    else pl.coyote -= dt;
    if (pl.jumpBuffer > 0) pl.jumpBuffer -= dt;
    if (pl.jumpBuffer > 0 && pl.coyote > 0) {
      pl.vy = -JUMP_V;
      pl.onGround = false;
      pl.coyote = 0;
      pl.jumpBuffer = 0;
      pl.ride = null;
      AUDIO.jump();
      dust(pl.x + PW / 2, pl.y + PH);
    }
    if (!inp.jump && pl.vy < -260) pl.vy = -260;  // jump cut

    pl.vy += GRAV * dt;
    if (pl.vy > MAX_FALL) pl.vy = MAX_FALL;

    // move + collide with tiles
    pl.x += pl.vx * dt;
    if (pl.x < 0) pl.x = 0;
    if (pl.x > levelW - PW) pl.x = levelW - PW;
    collideX(pl);
    pl.y += pl.vy * dt;
    pl.onGround = false;
    pl.ride = null;
    collideY(pl, prevBottom);

    // moving platforms (one-way, ride on top)
    for (var m = 0; m < movers.length; m++) {
      var mv = movers[m];
      if (pl.vy >= 0 && prevBottom <= mv.y + 8 &&
          overlap(pl.x, pl.y, PW, PH + 2, mv.x, mv.y, mv.w, mv.h)) {
        pl.y = mv.y - PH; pl.vy = 0; pl.onGround = true; pl.ride = mv;
      }
    }

    // landing feel
    if (!pl.wasOnGround && pl.onGround) {
      pl.squash = 1;
      dust(pl.x + PW / 2, pl.y + PH);
    }
    pl.wasOnGround = pl.onGround;
    pl.squash = Math.max(0, pl.squash - dt * 5);

    // running dust
    if (pl.onGround && Math.abs(pl.vx) > 180) {
      pl.stepDust -= dt;
      if (pl.stepDust <= 0) {
        pl.stepDust = 0.12;
        particles.push({
          x: pl.x + PW / 2 - pl.face * 12, y: pl.y + PH - 2,
          vx: -pl.face * 40, vy: -30, life: 0.25, max: 0.25,
          size: 3, color: 'rgba(255,255,255,0.8)', grav: 200
        });
      }
    }

    // spikes
    var c0 = Math.floor(pl.x / TILE), c1 = Math.floor((pl.x + PW - 1) / TILE);
    var r0 = Math.floor(pl.y / TILE), r1 = Math.floor((pl.y + PH - 1) / TILE);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (tileAt(c, r) === '^' &&
            overlap(pl.x + 5, pl.y + 5, PW - 10, PH - 10, c * TILE + 9, r * TILE + 16, TILE - 18, TILE - 16)) {
          killPlayer(pl);
          return;
        }
      }
    }

    // springs
    for (var s = 0; s < springs.length; s++) {
      var sp = springs[s];
      if (pl.vy > 0 && overlap(pl.x, pl.y, PW, PH, sp.x + 4, sp.y + 18, TILE - 8, TILE - 18)) {
        pl.vy = -SPRING_V;
        pl.onGround = false;
        sp.anim = 0.3;
        AUDIO.pad();
      }
    }

    // coins
    for (var k = 0; k < coins.length; k++) {
      var co = coins[k];
      if (!co.got && overlap(pl.x, pl.y, PW, PH, co.x - 13, co.y - 13, 26, 26)) {
        co.got = true;
        coinsGot++;
        AUDIO.orb();
        sparkle(co.x, co.y);
      }
    }

    // checkpoints
    for (var q = 0; q < checkpoints.length; q++) {
      var cp = checkpoints[q];
      if (overlap(pl.x, pl.y, PW, PH, cp.x, cp.y - TILE, TILE, TILE * 2)) {
        if (!cp.on) { cp.on = true; AUDIO.click(); sparkle(cp.x + TILE / 2, cp.y); }
        pl.cp = { x: cp.x + 4, y: cp.y - PH + TILE - 2 };
      }
    }

    // enemies
    for (var e = 0; e < enemies.length; e++) {
      var en = enemies[e];
      if (en.dead) continue;
      if (overlap(pl.x + 3, pl.y + 3, PW - 6, PH - 6, en.x + 3, en.y + 3, en.w - 6, en.h - 6)) {
        if (pl.vy > 100 && prevBottom <= en.y + 14) {
          en.dead = true; en.squash = 0.4;
          pl.vy = inp.jump ? -JUMP_V * 0.85 : -STOMP_V;
          AUDIO.orb();
          explode(en.x + en.w / 2, en.y + en.h / 2, '#c0455a');
        } else {
          killPlayer(pl);
          return;
        }
      }
    }

    // flag
    if (flag && overlap(pl.x, pl.y, PW, PH, flag.x, flag.y - TILE * 2, TILE, TILE * 3)) {
      winLevel();
      return;
    }

    // fell off the world
    if (pl.y > levelH + 80) killPlayer(pl);
  }

  function updateEnemies(dt) {
    for (var e = 0; e < enemies.length; e++) {
      var en = enemies[e];
      if (en.dead) { en.squash = Math.max(0, en.squash - dt); continue; }
      en.vy += GRAV * dt;
      if (en.vy > MAX_FALL) en.vy = MAX_FALL;
      en.x += en.vx * dt;
      var front = en.vx > 0 ? en.x + en.w : en.x;
      var fc = Math.floor(front / TILE);
      var rr = Math.floor((en.y + en.h / 2) / TILE);
      if (solidAt(fc, rr)) { en.vx *= -1; en.x += en.vx * dt * 2; }
      en.y += en.vy * dt;
      var br = Math.floor((en.y + en.h) / TILE);
      var bc0 = Math.floor(en.x / TILE), bc1 = Math.floor((en.x + en.w - 1) / TILE);
      var grounded = false;
      for (var c = bc0; c <= bc1; c++) {
        if (solidAt(c, br)) { en.y = br * TILE - en.h; en.vy = 0; grounded = true; break; }
      }
      if (grounded) {
        // turn at edges
        var footC = en.vx > 0 ? Math.floor((en.x + en.w + 2) / TILE) : Math.floor((en.x - 2) / TILE);
        var footR = Math.floor((en.y + en.h + 4) / TILE);
        if (!solidAt(footC, footR)) en.vx *= -1;
      }
    }
  }

  function updateMovers(dt) {
    for (var m = 0; m < movers.length; m++) {
      var mv = movers[m];
      var t = time * 1.2 + mv.phase;
      var off = Math.sin(t) * mv.range;
      var nx = mv.axis === 'h' ? mv.baseX + off : mv.baseX;
      var ny = mv.axis === 'v' ? mv.baseY + off : mv.baseY;
      var dx = nx - mv.x, dy = ny - mv.y;
      mv.x = nx; mv.y = ny;
      for (var p = 0; p < players.length; p++) {
        if (players[p].ride === mv && !players[p].dead) {
          players[p].x += dx;
          players[p].y += dy;
        }
      }
    }
  }

  function update(dt) {
    time += dt;
    updateMovers(dt);
    for (var p = 0; p < players.length; p++) {
      updatePlayer(players[p], dt);
      if (state !== 'play') return;
    }
    updateEnemies(dt);

    // camera follows the players (both stay on screen)
    var ax = 0, ay = 0, n = 0;
    for (p = 0; p < players.length; p++) {
      if (players[p].dead) continue;
      ax += players[p].x; ay += players[p].y; n++;
    }
    if (n > 0) {
      ax /= n; ay /= n;
      var tx = Math.max(0, Math.min(levelW - W, ax - W / 2 + PW / 2));
      var ty = Math.max(0, Math.min(levelH - H, ay - H * 0.55));
      camX += (tx - camX) * Math.min(1, 6 * dt);
      camY += (ty - camY) * Math.min(1, 6 * dt);
    }
    // keep everyone on screen in co-op
    for (p = 0; p < players.length; p++) {
      var pl = players[p];
      if (pl.dead) continue;
      if (pl.x < camX + 2) pl.x = camX + 2;
      if (pl.x > camX + W - PW - 2) pl.x = camX + W - PW - 2;
    }
  }

  // ---- particles ----
  function explode(x, y, color) {
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 100 + Math.random() * 320;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.3, max: 0.8,
        size: 4 + Math.random() * 5, color: color, grav: 600
      });
    }
  }
  function dust(x, y) {
    for (var i = 0; i < 5; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * PW, y: y,
        vx: (Math.random() - 0.5) * 100, vy: -30 - Math.random() * 50,
        life: 0.22, max: 0.22, size: 3, color: 'rgba(255,255,255,0.9)', grav: 300
      });
    }
  }
  function sparkle(x, y) {
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
        life: 0.3, max: 0.3, size: 4, color: '#ffe94a', grav: 0
      });
    }
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
    for (var i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      var span = W + 300;
      var x = ((cl.x - camX * cl.d + time * 6) % span + span) % span - 150;
      var y = cl.y - camY * cl.d * 0.5;
      if (theme.dark) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 2 + i * 2.1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        roundRect(x, y, cl.s * 1.8, cl.s * 0.55, cl.s * 0.27);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawTiles(theme) {
    var c0 = Math.max(0, Math.floor(camX / TILE) - 1);
    var c1 = Math.min(COLS - 1, Math.floor((camX + W) / TILE) + 1);
    var r0 = Math.max(0, Math.floor(camY / TILE) - 1);
    var r1 = Math.min(ROWS - 1, Math.floor((camY + H) / TILE) + 1);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var ch = grid[r].charAt(c);
        if (ch === ' ' || !ch) continue;
        var x = c * TILE - camX, y = r * TILE - camY;
        if (ch === '#') {
          ctx.fillStyle = theme.dirt;
          ctx.fillRect(x, y, TILE, TILE);
          if (tileAt(c, r - 1) !== '#') {
            ctx.fillStyle = theme.ground;
            ctx.fillRect(x, y, TILE, 12);
            ctx.fillStyle = theme.groundEdge;
            ctx.fillRect(x, y, TILE, 3);
          }
        } else if (ch === '=') {
          ctx.save();
          ctx.fillStyle = theme.groundEdge;
          roundRect(x + 1, y + 2, TILE - 2, 11, 5);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          roundRect(x + 1, y + 9, TILE - 2, 4, 2);
          ctx.fill();
          ctx.restore();
        } else if (ch === '^') {
          ctx.save();
          ctx.shadowColor = theme.accent;
          ctx.shadowBlur = 8;
          ctx.fillStyle = theme.accent;
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + TILE);
          ctx.lineTo(x + TILE / 4, y + 12);
          ctx.lineTo(x + TILE / 2, y + TILE - 6);
          ctx.lineTo(x + 3 * TILE / 4, y + 12);
          ctx.lineTo(x + TILE - 2, y + TILE);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  function drawEntities(theme) {
    var k, x, y;
    // coins
    for (k = 0; k < coins.length; k++) {
      var co = coins[k];
      if (co.got) continue;
      x = co.x - camX; y = co.y - camY;
      if (x < -40 || x > W + 40) continue;
      var sq = Math.abs(Math.sin(time * 3.5 + co.x * 0.05));
      ctx.save();
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffd91e';
      ctx.beginPath();
      ctx.ellipse(x, y + Math.sin(time * 2.4 + co.x * 0.1) * 3, 10 * (0.3 + 0.7 * sq), 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff7c4';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    // springs
    for (k = 0; k < springs.length; k++) {
      var sp = springs[k];
      x = sp.x - camX; y = sp.y - camY;
      if (x < -60 || x > W + 60) continue;
      if (sp.anim > 0) sp.anim -= 1 / 60;
      var comp = sp.anim > 0 ? 8 : 0;
      ctx.save();
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(x + 6, y + TILE - 8, TILE - 12, 8);
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffe94a';
      roundRect(x + 4, y + 16 + comp, TILE - 8, 10, 5);
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + TILE - 8);
      ctx.lineTo(x + TILE - 10, y + 26 + comp);
      ctx.moveTo(x + TILE - 10, y + TILE - 8);
      ctx.lineTo(x + 10, y + 26 + comp);
      ctx.stroke();
      ctx.restore();
    }
    // checkpoints
    for (k = 0; k < checkpoints.length; k++) {
      var cp = checkpoints[k];
      x = cp.x - camX; y = cp.y - camY;
      if (x < -60 || x > W + 60) continue;
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(x + 18, y - TILE + 6, 4, TILE + 28);
      ctx.save();
      if (cp.on) { ctx.shadowColor = '#7dff8a'; ctx.shadowBlur = 12; }
      ctx.fillStyle = cp.on ? '#7dff8a' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(x + 20, y - TILE + 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // movers
    for (k = 0; k < movers.length; k++) {
      var mv = movers[k];
      x = mv.x - camX; y = mv.y - camY;
      ctx.save();
      ctx.fillStyle = '#90a4ae';
      roundRect(x, y, mv.w, mv.h, 6);
      ctx.fill();
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(x + 2, y + 2, mv.w - 4, 4);
      ctx.fillStyle = '#546e7a';
      for (var rv = 0; rv < 3; rv++) {
        ctx.beginPath();
        ctx.arc(x + 14 + rv * 26, y + mv.h / 2 + 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // enemies (grumps)
    for (k = 0; k < enemies.length; k++) {
      var en = enemies[k];
      if (en.dead && en.squash <= 0) continue;
      x = en.x - camX; y = en.y - camY;
      if (x < -60 || x > W + 60) continue;
      var sy = en.dead ? 0.25 : 1 + Math.sin(time * 9 + en.x) * 0.05;
      ctx.save();
      ctx.translate(x + en.w / 2, y + en.h);
      ctx.scale(1 + (1 - sy) * 0.6, sy);
      ctx.shadowColor = '#c0455a';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#c0455a';
      roundRect(-en.w / 2, -en.h, en.w, en.h, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      var ed = en.vx > 0 ? 1 : -1;
      ctx.fillRect(-9 + ed * 2, -en.h + 8, 6, 8);
      ctx.fillRect(3 + ed * 2, -en.h + 8, 6, 8);
      ctx.fillStyle = '#3a0d16';
      ctx.fillRect(-7 + ed * 3, -en.h + 11, 3, 4);
      ctx.fillRect(5 + ed * 3, -en.h + 11, 3, 4);
      // angry brows
      ctx.strokeStyle = '#3a0d16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, -en.h + 7); ctx.lineTo(-2, -en.h + 10);
      ctx.moveTo(10, -en.h + 7); ctx.lineTo(2, -en.h + 10);
      ctx.stroke();
      ctx.restore();
    }
    // flag
    if (flag) {
      x = flag.x - camX; y = flag.y - camY;
      ctx.fillStyle = '#eceff1';
      ctx.fillRect(x + 16, y - TILE * 2 + 4, 5, TILE * 3 - 8);
      var wave = Math.sin(time * 6) * 3;
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 14;
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.moveTo(x + 21, y - TILE * 2 + 6);
      ctx.quadraticCurveTo(x + 48, y - TILE * 2 + 13 + wave, x + 66, y - TILE * 2 + 20);
      ctx.quadraticCurveTo(x + 48, y - TILE * 2 + 27 + wave, x + 21, y - TILE * 2 + 34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayers() {
    for (var p = 0; p < players.length; p++) {
      var pl = players[p];
      if (pl.dead) continue;
      if (pl.invuln > 0 && Math.floor(time * 12) % 2 === 0) continue; // blink
      var sk = SKINS.get(pl.idx);
      ctx.save();
      ctx.translate(pl.x + PW / 2 - camX, pl.y + PH / 2 - camY);
      var sx = 1, sy = 1;
      if (pl.squash > 0) { sx = 1 + 0.2 * pl.squash; sy = 1 - 0.24 * pl.squash; }
      else if (!pl.onGround) { var st = Math.min(1, Math.abs(pl.vy) / 900); sx = 1 - 0.08 * st; sy = 1 + 0.12 * st; }
      ctx.scale(sx * (PW / 36), sy * (PW / 36));
      ctx.rotate(pl.vx / RUN * 0.08);
      SKINS.drawCube(ctx, sk.color, sk.face);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var q = particles[i];
      var a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - camX - q.size / 2, q.y - camY - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawScene() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
    drawBG(level.theme);
    drawTiles(level.theme);
    drawEntities(level.theme);
    drawPlayers();
    drawParticles();
    ctx.restore();
    ctx.drawImage(vignette, 0, 0);
  }

  function drawHUD() {
    ctx.save();
    // coin counter
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(12, 12, 130, 34, 17);
    ctx.fill();
    ctx.shadowColor = '#ffe94a';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd91e';
    ctx.beginPath();
    ctx.ellipse(34, 29, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(coinsGot + ' / ' + coinsTotal, 52, 35);

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(level.name + (twoPlayer ? '  2P' : ''), W - 16, 32);
    if (deaths > 0) {
      ctx.font = '13px "Trebuchet MS", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Oofs: ' + deaths, W - 16, 52);
    }

    if (hintTimer > 0) {
      ctx.globalAlpha = Math.min(1, hintTimer);
      ctx.textAlign = 'center';
      ctx.font = 'bold 19px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      var msg = twoPlayer
        ? 'P1: A / D + W or SPACE   ·   P2: ← / → + ↑'
        : 'Move: A/D or ←/→  ·  Jump: W, SPACE or ↑';
      ctx.strokeText(msg, W / 2, 84);
      ctx.fillText(msg, W / 2, 84);
      ctx.strokeText('Stomp the grumps! Grab every coin! Reach the flag!', W / 2, 112);
      ctx.fillText('Stomp the grumps! Grab every coin! Reach the flag!', W / 2, 112);
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'left';
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = level.theme.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.fillText('ESC pause · M sound', 16, H - 10);
    ctx.restore();
  }

  // ---- UI ----
  function hovered(x, y, w, h) {
    return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  }

  function button(x, y, w, h, label, action, color) {
    uiButtons.push({ x: x, y: y, w: w, h: h, action: action });
    var hov = hovered(x, y, w, h);
    ctx.save();
    if (hov) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10; }
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

  function menuBG() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b3d1f');
    g.addColorStop(1, '#1f7a3d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      var span = W + 300;
      var x = ((cl.x + time * 14) % span + span) % span - 150;
      roundRect(x, cl.y * 0.8, cl.s * 1.8, cl.s * 0.55, cl.s * 0.27);
      ctx.fill();
    }
    ctx.restore();
    // grassy floor
    ctx.fillStyle = '#2a5d34';
    ctx.fillRect(0, H - 60, W, 60);
    ctx.fillStyle = '#3da14d';
    ctx.fillRect(0, H - 60, W, 12);
  }

  function drawMenu() {
    uiButtons = [];
    menuBG();

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#7dff8a';
    ctx.shadowBlur = 22 + 8 * Math.sin(time * 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "Trebuchet MS", sans-serif';
    ctx.fillText('CUBE QUEST', W / 2, 70);
    ctx.restore();
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('A platform adventure for one or two cubes!', W / 2, 100);

    button(14, 14, 140, 36, '⌂ All Games', function () {
      AUDIO.click();
      location.href = '../index.html';
    });

    // level cards
    var cw = 215, ch = 168, gap = 16;
    var x0 = (W - (4 * cw + 3 * gap)) / 2;
    for (var i = 0; i < LEVELS.length; i++) {
      (function (i) {
        var x = x0 + i * (cw + gap), y = 134;
        var th = LEVELS[i].theme;
        var hov = hovered(x, y, cw, ch);
        if (hov) y -= 3;
        uiButtons.push({ x: x, y: y, w: cw, h: ch, action: function () { AUDIO.click(); loadLevel(i); } });
        ctx.save();
        var g = ctx.createLinearGradient(x, y, x, y + ch);
        g.addColorStop(0, th.bgTop);
        g.addColorStop(1, th.bgBot);
        ctx.fillStyle = g;
        if (hov) { ctx.shadowColor = th.accent; ctx.shadowBlur = 16; }
        roundRect(x, y, cw, ch, 14);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = th.accent;
        ctx.lineWidth = hov ? 3 : 2;
        roundRect(x, y, cw, ch, 14);
        ctx.stroke();

        ctx.textAlign = 'center';
        var txtCol = th.dark ? '#ffffff' : '#143018';
        ctx.fillStyle = txtCol;
        ctx.font = 'bold 30px "Trebuchet MS", sans-serif';
        ctx.fillText(String(i + 1), x + cw / 2, y + 44);
        ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
        ctx.fillText(LEVELS[i].name, x + cw / 2, y + 72);

        var st = bestStars(i);
        var starStr = '';
        for (var s = 0; s < 3; s++) starStr += s < st ? '★' : '☆';
        ctx.font = '17px sans-serif';
        ctx.fillStyle = '#ffe94a';
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(starStr, x + cw / 2, y + 100);

        ctx.font = '13px "Trebuchet MS", sans-serif';
        ctx.fillStyle = th.dark ? 'rgba(255,255,255,0.75)' : 'rgba(20,48,24,0.8)';
        ctx.fillText(isDone(i) ? '✔ COMPLETE' : 'Not beaten yet', x + cw / 2, y + 126);
        ctx.fillText('Best coins: ' + bestCoins(i), x + cw / 2, y + 147);
        ctx.restore();
      })(i);
    }

    var bw = 219, bh = 44, bgap = 12;
    var bx0 = (W - (4 * bw + 3 * bgap)) / 2;
    var byy = 330;
    button(bx0, byy, bw, bh, '😎 Characters', function () { AUDIO.click(); state = 'skin'; });
    button(bx0 + (bw + bgap), byy, bw, bh,
      twoPlayer ? '👥 2 Player: ON' : '👤 2 Player: OFF',
      toggle2P, twoPlayer ? 'rgba(255,154,61,0.35)' : undefined);
    button(bx0 + 2 * (bw + bgap), byy, bw, bh,
      AUDIO.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON',
      function () { AUDIO.toggleMute(); });
    button(bx0 + 3 * (bw + bgap), byy, bw, bh, '🔺 Geometry Dash', function () {
      AUDIO.click();
      location.href = '../geometry/index.html';
    });

    // the two cubes running along the menu floor
    for (var p = 0; p < 2; p++) {
      var sk = SKINS.get(p);
      var px = ((time * (120 + p * 18) + p * 220) % (W + 100)) - 50;
      var hop = Math.abs(Math.sin(time * 5 + p * 1.7)) * 22;
      ctx.save();
      ctx.translate(px, H - 60 - 18 - hop);
      ctx.scale(0.9, 0.9);
      SKINS.drawCube(ctx, sk.color, sk.face);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.font = '13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('P1: A / D + W or SPACE  ·  P2: ← / → + ↑ or ENTER', W / 2, 408);
    ctx.fillText('Grab all the coins for 3 stars · Stomp grumps · If you fall, you respawn at your checkpoint', W / 2, 428);
  }

  function drawSkinScreen() {
    uiButtons = [];
    menuBG();

    var sk = SKINS.get(editingPlayer);
    var other = SKINS.get(1 - editingPlayer);

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = sk.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px "Trebuchet MS", sans-serif';
    ctx.fillText('CHOOSE YOUR CUBES', W / 2, 56);
    ctx.restore();

    button(430, 80, 162, 40, '🎮 Player 1',
      function () { editingPlayer = 0; AUDIO.click(); },
      editingPlayer === 0 ? 'rgba(0,229,255,0.35)' : undefined);
    button(604, 80, 162, 40, '🎮 Player 2',
      function () { editingPlayer = 1; AUDIO.click(); },
      editingPlayer === 1 ? 'rgba(255,154,61,0.35)' : undefined);

    var bounce = Math.abs(Math.sin(time * 2.6));
    ctx.save();
    ctx.translate(210, 290 - bounce * 70);
    ctx.rotate(Math.sin(time * 1.6) * 0.3);
    ctx.scale(2.6, 2.6);
    SKINS.drawCube(ctx, sk.color, sk.face);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText('Player ' + (editingPlayer + 1), 210, 398);

    ctx.save();
    ctx.translate(210, 428 + Math.sin(time * 4) * -3);
    SKINS.drawCube(ctx, other.color, other.face);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillText('Player ' + (2 - editingPlayer), 210, 466);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText('Color', 430, 152);
    var sw = 54, sgap = 14;
    for (var ci = 0; ci < SKINS.COLORS.length; ci++) {
      (function (ci) {
        var x = 430 + (ci % 4) * (sw + sgap);
        var y = 164 + Math.floor(ci / 4) * (sw + sgap);
        uiButtons.push({ x: x, y: y, w: sw, h: sw, action: function () { SKINS.set(editingPlayer, ci, null); AUDIO.click(); } });
        ctx.save();
        if (ci === sk.colorIdx || hovered(x, y, sw, sw)) {
          ctx.shadowColor = SKINS.COLORS[ci];
          ctx.shadowBlur = 16;
        }
        ctx.fillStyle = SKINS.COLORS[ci];
        roundRect(x, y, sw, sw, 12);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = ci === sk.colorIdx ? '#ffffff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = ci === sk.colorIdx ? 4 : 2;
        roundRect(x, y, sw, sw, 12);
        ctx.stroke();
        ctx.restore();
      })(ci);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText('Face', 430, 330);
    var fw = 62;
    for (var fi = 0; fi < SKINS.FACE_COUNT; fi++) {
      (function (fi) {
        var x = 430 + fi * (fw + 12);
        var y = 342;
        uiButtons.push({ x: x, y: y, w: fw, h: fw, action: function () { SKINS.set(editingPlayer, null, fi); AUDIO.click(); } });
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        roundRect(x, y, fw, fw, 12);
        ctx.fill();
        ctx.strokeStyle = fi === sk.faceIdx ? '#ffffff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = fi === sk.faceIdx ? 4 : 2;
        if (hovered(x, y, fw, fw)) ctx.strokeStyle = '#ffffff';
        roundRect(x, y, fw, fw, 12);
        ctx.stroke();
        ctx.translate(x + fw / 2, y + fw / 2);
        SKINS.drawCube(ctx, sk.color, fi);
        ctx.restore();
      })(fi);
    }

    button(W / 2 - 110, 448, 220, 44, '◀ Back', function () { AUDIO.click(); state = 'menu'; }, 'rgba(125,255,138,0.25)');
  }

  function toggle2P() {
    twoPlayer = !twoPlayer;
    try { localStorage.setItem('zp_2p', twoPlayer ? '1' : '0'); } catch (e) {}
    AUDIO.click();
  }

  function overlayTitle(title, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, 175);
    ctx.restore();
  }

  function drawWin() {
    uiButtons = [];
    drawScene();
    overlayTitle('LEVEL COMPLETE!', '#7dff8a');

    var stars = coinsGot >= coinsTotal ? 3 : (coinsGot >= coinsTotal * 0.6 ? 2 : 1);
    ctx.font = '50px sans-serif';
    ctx.fillStyle = '#ffe94a';
    var s = '';
    for (var i = 0; i < 3; i++) s += i < stars ? '★' : '☆';
    ctx.fillText(s, W / 2, 238);
    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('Coins: ' + coinsGot + ' / ' + coinsTotal + (deaths ? '   ·   Oofs: ' + deaths : '   ·   No oofs — amazing!'), W / 2, 282);
    if (coinsGot >= coinsTotal) {
      ctx.fillStyle = '#ffe94a';
      ctx.fillText('✨ ALL COINS! ✨', W / 2, 312);
    }

    var hasNext = levelIndex < LEVELS.length - 1;
    var bw = 190, bh = 50, y = 340;
    if (hasNext) {
      button(W / 2 - bw - 110, y, bw, bh, 'Replay', function () { AUDIO.click(); loadLevel(levelIndex); });
      button(W / 2 - bw / 2, y, bw, bh, 'Next Level ▶', function () { AUDIO.click(); loadLevel(levelIndex + 1); }, 'rgba(125,255,138,0.3)');
      button(W / 2 + 110, y, bw, bh, 'Menu', goMenu);
    } else {
      button(W / 2 - bw - 20, y, bw, bh, 'Replay', function () { AUDIO.click(); loadLevel(levelIndex); });
      button(W / 2 + 20, y, bw, bh, 'Menu', goMenu);
      ctx.fillStyle = '#ffe94a';
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.fillText('🏆 You finished the whole quest! 🏆', W / 2, 440);
    }
  }

  function drawPause() {
    uiButtons = [];
    drawScene();
    overlayTitle('PAUSED', '#7dff8a');
    var bw = 220, bh = 50;
    button(W / 2 - bw / 2, 240, bw, bh, 'Resume ▶', function () { AUDIO.click(); state = 'play'; }, 'rgba(125,255,138,0.25)');
    button(W / 2 - bw / 2, 302, bw, bh, 'Restart Level', function () { AUDIO.click(); loadLevel(levelIndex); });
    button(W / 2 - bw / 2, 364, bw, bh, 'Menu', goMenu);
  }

  function goMenu() {
    AUDIO.click();
    AUDIO.stopMusic();
    particles = [];
    state = 'menu';
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
    } else {
      time += dt;
    }
    updateParticles(dt);
    shake = Math.max(0, shake - dt * 1.6);

    if (state === 'menu') drawMenu();
    else if (state === 'skin') drawSkinScreen();
    else if (state === 'pause') drawPause();
    else if (state === 'win') drawWin();
    else {
      uiButtons = [];
      drawScene();
      drawHUD();
    }

    requestAnimationFrame(frame);
  }

  // ---- events ----
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
  });
  canvas.addEventListener('pointermove', function (e) {
    var pos = canvasPos(e);
    mouse.x = pos.x;
    mouse.y = pos.y;
  });

  window.addEventListener('keydown', function (e) {
    AUDIO.unlock();
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
    if (e.repeat) return;
    keysDown[e.code] = true;
    var owner = jumpKeyOwner(e.code);
    if (owner >= 0 && state === 'play' && players[owner] && !players[owner].dead) {
      players[owner].jumpBuffer = BUFFER;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state === 'play') { state = 'pause'; keysDown = {}; }
      else if (state === 'pause') state = 'play';
      else if (state === 'skin') state = 'menu';
    } else if (e.code === 'KeyM') {
      AUDIO.toggleMute();
    } else if (e.code === 'KeyR') {
      if (state === 'play' || state === 'pause') loadLevel(levelIndex);
    }
  });
  window.addEventListener('keyup', function (e) {
    keysDown[e.code] = false;
  });
  window.addEventListener('blur', function () {
    keysDown = {};
    if (state === 'play') state = 'pause';
  });

  // test hook (read-only)
  window.ZP_TEST = {
    state: function () { return state; },
    players: function () { return players.map(function (p) { return { x: p.x, y: p.y, dead: p.dead, onGround: p.onGround }; }); },
    coins: function () { return coinsGot; },
    tile: function (c, r) { return tileAt(c, r); },
    enemies: function () {
      return enemies.filter(function (e) { return !e.dead; })
        .map(function (e) { return { x: e.x, y: e.y }; });
    },
    load: function (i) { loadLevel(i); }
  };

  requestAnimationFrame(frame);
})();
