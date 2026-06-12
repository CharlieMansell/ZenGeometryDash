/* Zen Geometry Dash — procedural chiptune audio (WebAudio, no asset files).
 * Music is a simple step-sequencer: kick, hat, square bass, triangle lead.
 * Each level picks a "mood" pattern and a root note.
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var musicGain = null;
  var muted = false;
  try { muted = localStorage.getItem('zgd_muted') === '1'; } catch (e) {}

  // Pentatonic minor scale degrees -> semitone offsets
  var SCALE = [0, 3, 5, 7, 10, 12, 15, 17];

  // 16-step patterns per mood. lead/bass entries are scale indexes, null = rest.
  var MOODS = [
    { // 0: bright and bouncy (level 1)
      bass: [0, null, 0, null, 3, null, 3, null, 4, null, 4, null, 3, null, 1, null],
      lead: [4, null, 5, null, 4, null, 2, null, 3, null, 4, null, 2, null, null, null]
    },
    { // 1: garden groove
      bass: [0, 0, null, 0, 2, null, 2, null, 3, 3, null, 3, 2, null, 1, null],
      lead: [null, 4, null, 3, null, 4, 5, null, null, 4, null, 2, 3, null, null, null]
    },
    { // 2: floaty space
      bass: [0, null, null, 0, null, null, 4, null, 3, null, null, 3, null, null, 2, null],
      lead: [6, null, 5, null, 4, null, null, null, 5, null, 4, null, 2, null, null, null]
    },
    { // 3: driving party
      bass: [0, 0, 1, null, 0, 0, 3, null, 0, 0, 4, null, 3, null, 2, 1],
      lead: [4, null, 4, 5, null, 4, null, 2, 3, null, 3, 4, null, 3, null, null]
    },
    { // 4: intense finale
      bass: [0, 0, 0, 1, 2, 2, 2, 3, 4, 4, 4, 5, 3, 3, 2, 1],
      lead: [7, null, 6, null, 5, 6, null, 4, 5, null, 4, null, 2, 3, null, null]
    }
  ];

  var music = { playing: false, step: 0, nextTime: 0, timer: null, cfg: null };

  function ensure() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.55;
      musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function note(freq, time, dur, type, vol, dest, slideTo) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, time + dur);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g); g.connect(dest || master);
    o.start(time); o.stop(time + dur + 0.02);
  }

  function noise(time, dur, vol, freq, dest) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = freq || 4000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(f); f.connect(g); g.connect(dest || master);
    src.start(time);
  }

  function degFreq(rootHz, deg, octave) {
    return rootHz * Math.pow(2, (SCALE[deg % SCALE.length] + (octave || 0) * 12) / 12);
  }

  function scheduleStep(t) {
    var cfg = music.cfg;
    var mood = MOODS[cfg.mood % MOODS.length];
    var s = music.step % 16;
    var stepDur = (60 / cfg.bpm) / 4; // sixteenth note

    if (s % 4 === 0) note(150, t, 0.12, 'sine', 0.9, musicGain, 45); // kick
    if (s % 4 === 2) noise(t, 0.04, 0.25, 6000, musicGain);          // hat
    var bd = mood.bass[s];
    if (bd !== null) note(degFreq(cfg.root / 2, bd, 0), t, stepDur * 1.8, 'square', 0.16, musicGain);
    var ld = mood.lead[s];
    if (ld !== null) note(degFreq(cfg.root, ld, 1), t, stepDur * 1.6, 'triangle', 0.22, musicGain);

    music.step++;
    music.nextTime += stepDur;
  }

  var A = {
    get muted() { return muted; },

    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('zgd_muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },

    startMusic: function (cfg) {
      if (!ensure()) return;
      A.stopMusic();
      music.cfg = cfg;
      music.step = 0;
      music.playing = true;
      music.nextTime = ctx.currentTime + 0.06;
      music.timer = setInterval(function () {
        if (!music.playing) return;
        // schedule a little ahead so timing stays tight
        while (music.nextTime < ctx.currentTime + 0.15) scheduleStep(music.nextTime);
      }, 30);
    },

    stopMusic: function () {
      music.playing = false;
      if (music.timer) { clearInterval(music.timer); music.timer = null; }
    },

    jump: function () { if (ensure()) note(420, ctx.currentTime, 0.1, 'square', 0.18, master, 760); },
    orb: function () { if (ensure()) note(760, ctx.currentTime, 0.12, 'sine', 0.25, master, 1400); },
    pad: function () { if (ensure()) note(220, ctx.currentTime, 0.2, 'triangle', 0.3, master, 880); },
    portal: function () { if (ensure()) note(300, ctx.currentTime, 0.3, 'sine', 0.25, master, 1200); },
    click: function () { if (ensure()) note(900, ctx.currentTime, 0.05, 'square', 0.12, master); },

    death: function () {
      if (!ensure()) return;
      var t = ctx.currentTime;
      noise(t, 0.25, 0.4, 1200, master);
      note(300, t, 0.35, 'sawtooth', 0.3, master, 60);
    },

    win: function () {
      if (!ensure()) return;
      var t = ctx.currentTime;
      var freqs = [523, 659, 784, 1047];
      for (var i = 0; i < freqs.length; i++) {
        note(freqs[i], t + i * 0.12, 0.3, 'triangle', 0.3, master);
      }
      noise(t + 0.4, 0.3, 0.15, 5000, master);
    },

    // must be called from a user gesture at least once
    unlock: function () { ensure(); }
  };

  root.ZGD_AUDIO = A;
})(typeof window !== 'undefined' ? window : globalThis);
