/* Zen's Games — shared character skins.
 * Both players customise their own cube (color + face) and the choice
 * follows them into every game in the arcade (stored in localStorage).
 */
(function (root) {
  'use strict';

  var COLORS = ['#00e5ff', '#ff9a3d', '#7dff8a', '#ff5a5a', '#ffe94a', '#ff7ad9', '#b07aff', '#f1f5f9'];
  var FACE_COUNT = 5; // classic, happy, cool, ninja, wow
  var DEFAULTS = [
    { c: 0, f: 0 },   // P1: cyan, classic
    { c: 1, f: 1 }    // P2: orange, happy
  ];

  function readInt(key, fallback, max) {
    try {
      var v = parseInt(localStorage.getItem(key), 10);
      if (isNaN(v) || v < 0 || v > max) return fallback;
      return v;
    } catch (e) { return fallback; }
  }

  // one-time migration from the original Geometry Dash keys
  try {
    if (localStorage.getItem('zgd_skin_c') !== null && localStorage.getItem('zg_p1_c') === null) {
      localStorage.setItem('zg_p1_c', localStorage.getItem('zgd_skin_c'));
      localStorage.setItem('zg_p1_f', localStorage.getItem('zgd_skin_f') || '0');
    }
  } catch (e) {}

  function get(idx) {
    var d = DEFAULTS[idx] || DEFAULTS[0];
    var c = readInt('zg_p' + (idx + 1) + '_c', d.c, COLORS.length - 1);
    var f = readInt('zg_p' + (idx + 1) + '_f', d.f, FACE_COUNT - 1);
    return { colorIdx: c, faceIdx: f, color: COLORS[c], face: f };
  }

  function set(idx, colorIdx, faceIdx) {
    try {
      if (colorIdx !== null && colorIdx !== undefined) {
        localStorage.setItem('zg_p' + (idx + 1) + '_c', String(colorIdx));
      }
      if (faceIdx !== null && faceIdx !== undefined) {
        localStorage.setItem('zg_p' + (idx + 1) + '_f', String(faceIdx));
      }
    } catch (e) {}
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFace(ctx, face) {
    ctx.fillStyle = '#0a1a24';
    if (face === 0) {
      ctx.fillRect(-10, -8, 6, 9);
      ctx.fillRect(4, -8, 6, 9);
      roundRect(ctx, -8, 5, 16, 4, 2);
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
      roundRect(ctx, -13, -9, 26, 8, 3);      // sunglasses
      ctx.fill();
      ctx.fillRect(-15, -8, 30, 3);
      ctx.strokeStyle = '#0a1a24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, 7);
      ctx.lineTo(9, 5);
      ctx.stroke();
    } else if (face === 3) {
      ctx.fillRect(-15, -10, 30, 7);          // ninja band
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
      ctx.arc(0, 6, 5, 0, Math.PI * 2);       // wow mouth
      ctx.fill();
    }
  }

  // draws a 36px cube centred on the origin (use ctx.scale for other sizes)
  function drawCube(ctx, color, face) {
    var s = 36;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    roundRect(ctx, -s / 2, -s / 2, s, s, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, -s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 5);
    ctx.stroke();
    drawFace(ctx, face);
  }

  root.ZG_SKINS = {
    COLORS: COLORS,
    FACE_COUNT: FACE_COUNT,
    get: get,
    set: set,
    drawCube: drawCube
  };
})(typeof window !== 'undefined' ? window : globalThis);
