/* ===== cm-mascot: scripted paper mascot (no pointer input, no physics engine) ===== */
'use strict';
var C = { ink:'#2B3A45', skin:'#DCC0A3', hair:'#3E5A70', steel:'#63809A', cream:'#F4EFE7', amber:'#D08C4A' };
var ST = 'stroke="#000" stroke-opacity=".07" stroke-width="1.5"';
var LAYER = { hand:4.8, torso:1, str:3.6, face:3.8, hair:4, phones:5.5, strand:4.5 }; // shared-light depth (45 deg, fixed)
var HAIR_D = 'M144 200Q140 84 256 80q116 4 112 120-22-50-56-50-22-22-50-2-30-20-56 2-36-4-62 50z';
var AH = [[246,96],[232,44],[272,20],[306,10],[312,32],[288,28],[276,44],[266,62],[274,96]];
var MOUTH = { rest:[244,262,256,274,268,262,256,274,244,262], happy:[238,258,256,286,274,258,256,264,238,258], think:[246,268,257,266,268,266,257,266,246,268] };
var TUCK = { x:268, y:448 }, OUT = { x:359, y:378 }, NECK = { x:256, y:300 };
var ZERO = { hr:0, hy:0, hx:0, smile:0, gx:0, gy:0, brow:0, mt:0, arm:0, swing:0 };
var uid = 0, apis = [];

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function sm(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
function eob(x) { x = clamp(x, 0, 1); var c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
function lerp(a, b, t) { return a + (b - a) * t; }
function nodShape(t, dur, roll, drop) { // fast dip, slower return, zero velocity at both ends (the ahoge spring supplies the overshoot)
  var u = clamp(t / dur, 0, 1), s = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 2);
  return { hy: drop * s, hr: roll * s };
}
function mix(a, b) { for (var k in b) a[k] = b[k]; return a; }

/* ---- scripted clips: pure functions of clip time ---- */
var CLIPS = {
  idle: { dur: 1, loop: true, pose: function () { return {}; } },
  nod: { dur: 0.7, pose: function (t) { return nodShape(t, 0.7, 3, 4.5); } },
  perk: { dur: 1.1, pose: function (t) { var p = nodShape(t, 0.5, 2, 3); p.smile = sm(t / 0.15) * (1 - sm((t - 0.8) / 0.3)); return p; } },
  hello: { dur: 3.5, pose: function (t) {
    var p = nodShape(t, 0.6, 2.4, 3.5), u = t - 0.8;
    p.arm = t < 0.15 ? 0 : t < 0.8 ? eob((t - 0.15) / 0.65) : t < 2.6 ? 1 : 1 - sm((t - 2.6) / 0.6);
    p.swing = (u > 0 && u < 1.6) ? 13 * Math.sin(2 * Math.PI * u / 0.53) * sm(u / 0.15) * (1 - sm((u - 1.45) / 0.15)) : 0;
    p.smile = sm((t - 0.2) / 0.3) * (1 - sm((t - 2.8) / 0.5));
    return p; } },
  thinking: { dur: 1, loop: true, pose: function (t) {
    var e = sm(t / 0.45), T = [[0.8,-0.85],[-0.6,-0.9],[0.2,-0.6]], per = 1.25, u = t / per, i = Math.floor(u);
    var f = sm((u - i) * per / 0.22), pv = i === 0 ? [0, 0] : T[(i + 2) % 3], cu = T[i % 3];
    return { hr: (-3.6 + 1.1 * Math.sin(2 * Math.PI * t / 2.6)) * e, brow: e, mt: e, gx: lerp(pv[0], cu[0], f) * e, gy: lerp(pv[1], cu[1], f) * e }; } },
  pleased: { dur: 1.6, pose: function (t) { var p = nodShape(t, 0.55, 3, 4.5); p.smile = sm(t / 0.2) * (1 - sm((t - 1.1) / 0.4)); return p; } }
};
/* Reduced motion: one fixed pose per state, no timers or frames */
var STATIC = { idle: {}, perk: { smile: 1 }, hello: { smile: 1 }, pleased: { smile: 1 },
               thinking: { hr: -3.6, brow: 1, mt: 1, gx: 0.8, gy: -0.85 } };

function ahogeD(b, s) {
  var p = AH.map(function (q) { var h = Math.max(0, (96 - q[1]) / 86); return [q[0] + b * h * h, 96 - (96 - q[1]) * (1 + s)]; });
  var f = function (i) { return p[i][0].toFixed(1) + ' ' + p[i][1].toFixed(1); };
  return 'M' + f(0) + 'Q' + f(1) + ' ' + f(2) + 'Q' + f(3) + ' ' + f(4) + 'Q' + f(5) + ' ' + f(6) + 'Q' + f(7) + ' ' + f(8) + 'Z';
}
function mouthD(m) { return 'M' + m[0] + ' ' + m[1] + 'Q' + m[2] + ' ' + m[3] + ' ' + m[4] + ' ' + m[5] + 'Q' + m[6] + ' ' + m[7] + ' ' + m[8] + ' ' + m[9] + 'Z'; }

/* o: { vb:'x y w h', c:[cx,cy,r], hand:bool, ss:shadow scale } */
function build(id, o) {
  var off = function (n) { return (1.697 * LAYER[n] * o.ss).toFixed(2); };
  var fl = function (n, extra, box) { return '<filter id="' + id + n + '" x="' + (box || '-30%') + '" y="' + (box || '-30%') + '" width="' + (box ? '200%' : '160%') + '" height="' + (box ? '200%' : '160%') + '"><feDropShadow dx="' + off(LAYERMAP[n]) + '" dy="' + off(LAYERMAP[n]) + '" stdDeviation="0.6" flood-color="#18232D" flood-opacity=".25"/>' + (extra || '') + '</filter>'; };
  var LAYERMAP = { fT:'torso', fS:'str', fF:'face', fH:'hair', fP:'phones', fA:'strand', fN:'hand' };
  var circ = '<circle cx="' + o.c[0] + '" cy="' + o.c[1] + '" r="' + o.c[2] + '"';
  var hand = !o.hand ? '' :
    '<g data-r="hw" filter="url(#' + id + 'fN)" display="none"><g data-r="hd" transform="translate(268 448)"><g data-r="hp">' +
    '<path ' + ST + ' transform="scale(-0.8 0.8)" d="M-16 6L-20 -40Q-22 -78 6 -80Q32 -80 30 -46L40 -54Q54 -60 56 -44Q56 -34 34 -16L18 6Z" fill="' + C.skin + '"/></g>' +
    '<rect x="-19" y="-2" width="38" height="18" rx="6" fill="' + C.steel + '" ' + ST + '/></g></g>';
  return '<svg viewBox="' + o.vb + '" aria-hidden="true"><defs>' +
    fl('fT') + fl('fS') + fl('fF') + fl('fH') + fl('fP') + (o.hand ? fl('fN') : '') +
    fl('fA', '<feComposite in2="SourceGraphic" operator="out"/>', '-50%') +
    '<clipPath id="' + id + 'c">' + (o.clipRect ? '<rect x="0" y="-50" width="512" height="' + (o.clipRect + 50) + '"/>' : circ + '/>') + '</clipPath>' +
    '<mask id="' + id + 'm" maskUnits="userSpaceOnUse" x="0" y="-100" width="512" height="700"><rect x="0" y="-100" width="512" height="700" fill="#fff"/><path d="' + HAIR_D + '" fill="#000"/></mask></defs>' +
    circ + ' fill="' + C.cream + '"' + (o.ring ? ' stroke="' + o.ring + '" stroke-width="7"' : '') + '/>' +
    '<g clip-path="url(#' + id + 'c)"><path filter="url(#' + id + 'fT)" ' + ST + ' d="M150 470Q140 330 196 300L316 300Q372 330 362 470Z" fill="' + C.steel + '"/>' +
    '<g filter="url(#' + id + 'fS)"><path d="M226 312Q218 352 223 392" fill="none" stroke="' + C.cream + '" stroke-width="9" stroke-linecap="round"/><path d="M286 312Q294 352 289 392" fill="none" stroke="' + C.cream + '" stroke-width="9" stroke-linecap="round"/></g></g>' +
    hand +
    '<g data-r="head"><circle filter="url(#' + id + 'fF)" ' + ST + ' cx="256" cy="196" r="112" fill="' + C.skin + '"/>' +
    '<path filter="url(#' + id + 'fH)" ' + ST + ' d="' + HAIR_D + '" fill="' + C.hair + '"/>' +
    '<g data-r="gz"><g data-r="eo"><g data-r="eL"><circle cx="214" cy="208" r="14" fill="' + C.ink + '"/><circle cx="219" cy="202" r="5" fill="#fff"/></g>' +
    '<g data-r="eR"><circle cx="298" cy="208" r="14" fill="' + C.ink + '"/><circle cx="303" cy="202" r="5" fill="#fff"/></g></g></g>' +
    '<g data-r="eh" display="none" fill="none" stroke="' + C.ink + '" stroke-width="7" stroke-linecap="round"><path d="M196 210Q214 196 232 210"/><path d="M280 210Q298 196 316 210"/></g>' +
    '<path data-r="brow" display="none" d="M282 172Q304 156 322 168" fill="none" stroke="' + C.ink + '" stroke-width="6" stroke-linecap="round"/>' +
    '<g fill="none" stroke="' + C.ink + '" stroke-width="9"><circle cx="214" cy="206" r="36"/><circle cx="298" cy="206" r="36"/><path d="M250 202q6-7 12 0" stroke-linecap="round"/></g>' +
    '<path data-r="mo" d="' + mouthD(MOUTH.rest) + '" fill="' + C.ink + '" stroke="' + C.ink + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g filter="url(#' + id + 'fP)"><path d="M134 196Q130 56 256 52q126 4 122 144" fill="none" stroke="' + C.ink + '" stroke-width="14" stroke-linecap="round"/>' +
    '<rect x="116" y="166" width="40" height="72" rx="20" fill="' + C.ink + '"/><rect x="356" y="166" width="40" height="72" rx="20" fill="' + C.ink + '"/>' +
    '<rect x="124" y="186" width="6" height="32" rx="3" fill="' + C.amber + '"/><rect x="382" y="186" width="6" height="32" rx="3" fill="' + C.amber + '"/></g>' +
    '<g mask="url(#' + id + 'm)"><path data-r="ahs" filter="url(#' + id + 'fA)" d="' + ahogeD(0, 0) + '" fill="' + C.hair + '"/></g>' +
    '<path data-r="ah" d="' + ahogeD(0, 0) + '" fill="' + C.hair + '"/></g></svg>';
}

/* ---- one shared frame loop; only runs while something is moving ---- */
var actors = [], raf = 0;
var nowS = function () { return performance.now() / 1000; };
function wake() { if (!raf) raf = requestAnimationFrame(frame); }
function frame() { raf = 0; var t = nowS(), busy = false; for (var i = 0; i < actors.length; i++) busy = actors[i].step(t) || busy; if (busy) raf = requestAnimationFrame(frame); }

var rmq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
function reduced() { return rmq.matches; }

var H = 1 / 120, BLINKS = [3.1, 4.4, 2.6, 5.3, 3.6, 0.35, 6.1], NODS = [9.5, 13, 10.5];

function create(host, o) {
  o = mix({ ss: 1, hand: false, handScale: 1, swingGain: 1, vb: '100 40 312 312', c: [256, 196, 156], nods: true }, o || {});
  var id = 'cm' + (++uid) + '-';
  host.innerHTML = build(id, o);
  var q = function (n) { return host.querySelector('[data-r="' + n + '"]'); };
  var el = { head: q('head'), gz: q('gz'), eo: q('eo'), eL: q('eL'), eR: q('eR'), eh: q('eh'), brow: q('brow'), mo: q('mo'), ah: q('ah'), ahs: q('ahs'), hw: q('hw'), hd: q('hd'), hp: q('hp') };
  var cache = {};
  function set(e, name, v) { var key = e.getAttribute('data-r') + name; if (cache[key] !== v) { cache[key] = v; e.setAttribute(name, v); } }
  var A = { clip: CLIPS.idle, name: 'idle', t0: nowS(), from: null, simT: nowS(), b: 0, bv: 0, s: 0, sv: 0, x1: 0, x2: 0, y1: 0, y2: 0, blinkAt: -9, timers: [], bi: 0, ni: 0, live: true };
  var XF = 0.25;

  function rawPose(t) { var c = A.clip, tt = Math.max(0, c.loop ? t : Math.min(t, c.dur)); return mix(mix({}, ZERO), c.pose(tt)); }
  function poseAt(t) {
    var tt = t - A.t0, p = rawPose(tt);
    if (A.from && tt < XF) { var w = sm(tt / XF); for (var k in ZERO) p[k] = lerp(A.from[k], p[k], w); }
    return p;
  }
  function setClip(name, at) {
    var f = poseAt(at), p0 = mix(mix({}, ZERO), CLIPS[name].pose(0)), far = 0;
    for (var k in ZERO) far = Math.max(far, Math.abs(f[k] - p0[k]));
    A.from = far > 0.4 ? f : null; A.clip = CLIPS[name]; A.name = name; A.t0 = at;   // crossfade only when the pose actually jumps
  }
  function baseXY(p) { var r = p.hr * Math.PI / 180; return [p.hx + 208 * Math.sin(r), p.hy + 208 * (Math.cos(r) - 1)]; }

  function draw(p, t) {
    var happy = p.smile >= 0.5;
    set(el.head, 'transform', 'translate(' + p.hx.toFixed(2) + ' ' + p.hy.toFixed(2) + ') rotate(' + p.hr.toFixed(2) + ' 256 300)');
    set(el.eo, 'display', happy ? 'none' : 'inline');
    set(el.eh, 'display', happy ? 'inline' : 'none');
    set(el.gz, 'transform', 'translate(' + (p.gx * 7).toFixed(2) + ' ' + (p.gy * 6).toFixed(2) + ')');
    var bl = 1, d = Math.abs(t - A.blinkAt);
    if (d < 0.09) bl = 0.1 + 0.9 * d / 0.09;
    var bt = bl.toFixed(2);
    set(el.eL, 'transform', 'translate(214 208) scale(1 ' + bt + ') translate(-214 -208)');
    set(el.eR, 'transform', 'translate(298 208) scale(1 ' + bt + ') translate(-298 -208)');
    set(el.brow, 'display', p.brow > 0.05 ? 'inline' : 'none');
    set(el.brow, 'transform', 'translate(0 ' + (-6 * p.brow).toFixed(2) + ')');
    var m = MOUTH.rest.map(function (a, i) { return a + (MOUTH.happy[i] - a) * clamp(p.smile, 0, 1) + (MOUTH.think[i] - a) * p.mt; });
    set(el.mo, 'd', mouthD(m.map(function (v) { return v.toFixed(1); })));
    var ad = ahogeD(A.b, A.s); set(el.ah, 'd', ad); set(el.ahs, 'd', ad);
    if (el.hw) {
      var a = p.arm, wx = TUCK.x + (OUT.x - TUCK.x) * a, wy = TUCK.y + (OUT.y - TUCK.y) * a, g = clamp(a, 0, 1);
      var delta = (Math.atan2(wy - NECK.y, wx - NECK.x) - Math.atan2(TUCK.y - NECK.y, TUCK.x - NECK.x)) * 180 / Math.PI;
      var vis = sm((a - 0.66) / 0.21);
      set(el.hw, 'display', vis > 0.01 ? 'inline' : 'none');
      set(el.hw, 'opacity', vis.toFixed(2));
      set(el.hd, 'transform', 'translate(' + wx.toFixed(2) + ' ' + wy.toFixed(2) + ') rotate(' + (delta * 0.35 + 38 * g).toFixed(2) + ') scale(' + o.handScale + ')');
      set(el.hp, 'transform', 'rotate(' + (p.swing * o.swingGain).toFixed(2) + ')');
    }
  }

  var W2 = Math.pow(2 * Math.PI * 3.0, 2), W1 = 2 * Math.PI * 3.0, Z = 0.17;
  function stepSprings(t) {
    var p = poseAt(t), xy = baseXY(p), ax = (xy[0] - 2 * A.x1 + A.x2) / (H * H), ay = (xy[1] - 2 * A.y1 + A.y2) / (H * H);
    A.x2 = A.x1; A.x1 = xy[0]; A.y2 = A.y1; A.y1 = xy[1];
    A.bv += (-W2 * A.b - 2 * Z * W1 * A.bv - 4.2 * ax) * H; A.b = clamp(A.b + A.bv * H, -22, 22);
    A.sv += (-W2 * A.s - 2 * Z * W1 * A.sv + 0.08 * ay) * H; A.s = clamp(A.s + A.sv * H, -0.15, 0.2);
  }

  A.step = function (t) {
    if (!A.live) return false;
    if (!A.clip.loop && t - A.t0 >= A.clip.dur) setClip('idle', A.t0 + A.clip.dur);
    if (t - A.simT > 0.25) A.simT = t - 0.25;
    while (A.simT + H <= t) { A.simT += H; stepSprings(A.simT); }
    draw(poseAt(t), t);
    var energy = Math.abs(A.b) + Math.abs(A.bv) * 0.05 + Math.abs(A.s) * 40 + Math.abs(A.sv) * 2;
    var moving = A.clip.loop ? A.name !== 'idle' : true;
    var xfading = A.from && t - A.t0 < XF;
    if (A.name === 'idle' && !xfading && energy < 0.02 && t - A.blinkAt > 0.1) { A.b = A.bv = A.s = A.sv = 0; draw(poseAt(t), t); return false; }
    return moving || energy >= 0.02 || t - A.blinkAt <= 0.1 || xfading;
  };

  function clearTimers() { A.timers.forEach(clearTimeout); A.timers = []; }
  function schedule() {
    clearTimers();
    if (reduced()) return;
    A.timers.push(setTimeout(function blink() { if (!reduced() && A.name !== 'hello') { A.blinkAt = nowS(); wake(); } A.timers.push(setTimeout(blink, BLINKS[A.bi++ % BLINKS.length] * 1000)); }, 1800));
    if (o.nods) A.timers.push(setTimeout(function nod() { if (!reduced() && A.name === 'idle') api.go('nod'); A.timers.push(setTimeout(nod, NODS[A.ni++ % NODS.length] * 1000)); }, 6500));
  }
  function drawStatic(name) {
    var p = mix(mix({}, ZERO), STATIC[name] || {}); A.b = A.bv = A.s = A.sv = 0; A.name = name; A.from = null; A.blinkAt = -9; draw(p, nowS());
  }
  var api = {
    go: function (name) {
      if (reduced()) { drawStatic(name); return; }
      var t = nowS(); A.simT = Math.max(A.simT, t - 0.25); setClip(name, t); wake();
    },
    get state() { return A.name; },
    refresh: function () { schedule(); if (reduced()) drawStatic(A.name === 'thinking' ? 'thinking' : 'idle'); else { setClip('idle', nowS()); wake(); } },
    destroy: function () { clearTimers(); A.live = false; actors.splice(actors.indexOf(A), 1); apis.splice(apis.indexOf(api), 1); host.innerHTML = ''; }
  };
  apis.push(api); actors.push(A); schedule();
  if (reduced()) drawStatic('idle'); else draw(poseAt(nowS()), nowS());
  return api;
}
function refreshAll() { apis.forEach(function (a) { a.refresh(); }); }
if (rmq.addEventListener) rmq.addEventListener('change', refreshAll);
export { create };
