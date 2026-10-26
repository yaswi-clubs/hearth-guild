// Canvas renderer for the isometric village and the weekly boss.
import { BUILDINGS, HOUSE_SLOTS, SCENERY, bossFor, maxHP, dealt, memberList, canAfford } from './rules.js';

const W = 440, H = 440, TW = 60, TH = 30, OX = 220, OY = 215, N = 7;
const iso = (i, j) => ({ x: OX + (i - j) * TW / 2, y: OY + (i + j) * TH / 2 });

function sh(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((m - r) * p + r); g = Math.round((m - g) * p + g); b = Math.round((m - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

export function createVillage(canvas, { onTap } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let S = null, sel = null, shownHP = null, bossKey = null, bossGone = false;
  let parts = [], shots = [], floats = [], hits = [], chimneys = [];
  let bossShake = 0, bossFlash = 0, T = 0, last = performance.now(), raf = 0, running = true;
  const pop = {};
  const clouds = [{ x: 40, y: 135, s: 1 }, { x: 300, y: 175, s: 0.8 }, { x: 190, y: 110, s: 0.6 }];

  const poly = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const walls = (x, y, a, b, h, c) => { poly([[x - a, y], [x, y + b], [x, y + b - h], [x - a, y - h]], sh(c, -0.08)); poly([[x, y + b], [x + a, y], [x + a, y - h], [x, y + b - h]], sh(c, -0.25)); };
  const topFace = (x, y, a, b, h, c) => poly([[x - a, y - h], [x, y + b - h], [x + a, y - h], [x, y - b - h]], c);
  const roof = (x, y, a, b, h, rh, c) => {
    const k = 1.18, A = a * k, B = b * k;
    poly([[x - A, y - h + 2], [x, y + B - h + 2], [x, y - h - rh]], sh(c, 0));
    poly([[x, y + B - h + 2], [x + A, y - h + 2], [x, y - h - rh]], sh(c, -0.22));
    ctx.strokeStyle = sh(c, -0.4); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - A, y - h + 2); ctx.lineTo(x, y + B - h + 2); ctx.lineTo(x + A, y - h + 2); ctx.stroke();
  };
  const lwin = (x, y, a, b, t1, t2, u1, u2, c) => { const P = (t, u) => [x - a + t * a, y + t * b - u]; poly([P(t1, u1), P(t2, u1), P(t2, u2), P(t1, u2)], c); };
  const rwin = (x, y, a, b, t1, t2, u1, u2, c) => { const P = (t, u) => [x + t * a, y + b - t * b - u]; poly([P(t1, u1), P(t2, u1), P(t2, u2), P(t1, u2)], c); };
  const shadow = (x, y, a, b) => { ctx.fillStyle = 'rgba(30,60,20,.22)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 3, a * 1.05, b * 1.05, 0, 0, 7); ctx.fill(); };
  const flag = (x, y, col, len = 16) => {
    ctx.strokeStyle = '#5a3d26'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 22);
    for (let k = 0; k <= len; k += 2) ctx.lineTo(x + k, y - 22 + Math.sin(T * 4 + k * 0.4) * 1.6);
    for (let k = len; k >= 0; k -= 2) ctx.lineTo(x + k, y - 13 + Math.sin(T * 4 + k * 0.4) * 1.6);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  const strokeLines = (x, y, a, b, h) => { ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; for (let u = 6; u < h; u += 7) { ctx.beginPath(); ctx.moveTo(x - a, y - u); ctx.lineTo(x, y + b - u); ctx.lineTo(x + a, y - u); ctx.stroke(); } };

  const draw = {
    house(x, y, lvl, col) {
      const a = 19, b = 10, h = 17 + (lvl - 1) * 11;
      shadow(x, y, a + 2, b + 2); walls(x, y, a, b, h, '#f7e6c4');
      if (lvl > 1) { ctx.strokeStyle = '#a77a52'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - a, y - 17); ctx.lineTo(x, y + b - 17); ctx.lineTo(x + a, y - 17); ctx.stroke(); }
      for (let f = 0; f < lvl; f++) { lwin(x, y, a, b, 0.25, 0.45, 5 + f * 11, 11 + f * 11, '#ffe08a'); lwin(x, y, a, b, 0.6, 0.8, 5 + f * 11, 11 + f * 11, '#ffe08a'); }
      rwin(x, y, a, b, 0.35, 0.6, 0, 10, '#7a4b2a');
      if (lvl >= 2) { const cx = x + 8, cy = y - h - 6; walls(cx, cy, 3, 1.5, 10, '#b36b4a'); chimneys.push([cx, cy - 10]); }
      roof(x, y, a, b, h, 15 + lvl * 2, col);
      if (lvl >= 3) flag(x, y - h - 15 - lvl * 2, col, 12);
      return { a: a + 4, top: h + 15 + lvl * 2 + (lvl >= 3 ? 22 : 0) };
    },
    hall(x, y, lvl) {
      const a = 27, b = 14, h = 30 + (lvl - 1) * 8;
      shadow(x, y, a + 3, b + 3); walls(x, y, a, b, h, '#e3dccd'); strokeLines(x, y, a, b, h);
      [[0.18, '#d9483b'], [0.62, '#3f6fb5']].forEach(([tt, c]) => {
        const px = x - a + tt * a, py = y + tt * b;
        poly([[px, py - h + 4], [px + 7, py + 3.5 - h + 4], [px + 7, py + 3.5 - h + 22], [px + 3.5, py + 1.7 - h + 18], [px, py - h + 22]], c);
        ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(px + 3.5, py + 1.7 - h + 11, 2, 0, 7); ctx.fill();
      });
      rwin(x, y, a, b, 0.38, 0.62, 0, 15, '#5e3a22'); rwin(x, y, a, b, 0.42, 0.58, 1, 13, '#7a4b2a');
      rwin(x, y, a, b, 0.12, 0.26, 14, 22, '#ffe08a'); rwin(x, y, a, b, 0.74, 0.88, 14, 22, '#ffe08a');
      if (lvl >= 3) { rwin(x, y, a, b, 0.12, 0.26, 28, 34, '#ffe08a'); rwin(x, y, a, b, 0.74, 0.88, 28, 34, '#ffe08a'); }
      roof(x, y, a, b, h, 24, '#3f6fb5'); flag(x, y - h - 24, '#f5c542', 18);
      return { a: a + 5, top: h + 46 };
    },
    tower(x, y) {
      const a = 12, b = 6, h = 62;
      shadow(x, y, a + 2, b + 2); walls(x, y, a, b, h, '#d6cfc0'); strokeLines(x, y, a, b, h);
      lwin(x, y, a, b, 0.4, 0.6, 40, 48, '#3a2a1c'); rwin(x, y, a, b, 0.4, 0.6, 0, 12, '#6e4529');
      topFace(x, y, a + 2, b + 1, h, '#c4bcab');
      for (let k = 0; k < 4; k++) { const tt = k / 3; walls(x - a - 2 + tt * (a + 2), y + tt * (b + 1) - h, 2.2, 1.1, 5, '#d6cfc0'); }
      flag(x, y - h, '#d9483b', 16);
      return { a: a + 6, top: h + 24 };
    },
    library(x, y) {
      const a = 21, b = 11, h = 30;
      shadow(x, y, a + 2, b + 2); walls(x, y, a, b, h, '#ece4f5');
      for (const u of [6, 18]) { lwin(x, y, a, b, 0.2, 0.38, u, u + 8, '#a8d4ff'); lwin(x, y, a, b, 0.55, 0.73, u, u + 8, '#a8d4ff'); }
      rwin(x, y, a, b, 0.35, 0.62, 0, 13, '#6b4fa3'); roof(x, y, a, b, h, 20, '#6b4fa3');
      ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(x, y - h - 20, 3, 0, 7); ctx.fill();
      return { a: a + 4, top: h + 24 };
    },
    bakery(x, y) {
      const a = 20, b = 10, h = 22;
      shadow(x, y, a + 2, b + 2); walls(x, y, a, b, h, '#f6d7a7');
      lwin(x, y, a, b, 0.2, 0.75, 6, 14, '#ffe9b0'); rwin(x, y, a, b, 0.35, 0.6, 0, 12, '#7a4b2a');
      const cx = x - 6, cy = y - h - 4; walls(cx, cy, 3, 1.5, 14, '#a5603f'); chimneys.push([cx, cy - 14]);
      roof(x, y, a, b, h, 16, '#c4553a');
      ctx.fillStyle = '#d99a4e'; ctx.beginPath(); ctx.ellipse(x + a * 0.8, y - h + 4, 5, 3.2, -0.4, 0, 7); ctx.fill();
      return { a: a + 4, top: h + 20 };
    },
    market(x, y) {
      shadow(x, y, 24, 12);
      const stall = (sx, sy, c) => {
        walls(sx, sy, 9, 4.5, 9, '#d8b07a'); topFace(sx, sy, 9, 4.5, 9, '#e9c48f');
        for (let k = 0; k < 4; k++) {
          const t1 = k / 4, t2 = (k + 1) / 4;
          const P = (t, u) => [sx - 11 + t * 11, sy + t * 5.5 - u]; poly([P(t1, 13), P(t2, 13), P(t2, 19), P(t1, 19)], k % 2 ? '#fff' : c);
          const Q = (t, u) => [sx + t * 11, sy + 5.5 - t * 5.5 - u]; poly([Q(t1, 13), Q(t2, 13), Q(t2, 19), Q(t1, 19)], k % 2 ? sh('#ffffff', -0.15) : sh(c, -0.2));
        }
        ctx.fillStyle = '#e0603f'; ctx.beginPath(); ctx.arc(sx - 3, sy - 11, 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#5fb85a'; ctx.beginPath(); ctx.arc(sx + 2, sy - 11, 2, 0, 7); ctx.fill();
      };
      stall(x - 9, y - 3, '#d9483b'); stall(x + 10, y + 4, '#3f6fb5');
      return { a: 24, top: 26 };
    },
    well(x, y) {
      shadow(x, y, 12, 6);
      ctx.fillStyle = '#8f97a8'; ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI); ctx.lineTo(x - 12, y - 10); ctx.ellipse(x, y - 10, 12, 6, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b9c0cf'; ctx.beginPath(); ctx.ellipse(x, y - 10, 12, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3d78c4'; ctx.beginPath(); ctx.ellipse(x, y - 10, 8.5, 4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6e4529'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 10, y - 10); ctx.lineTo(x - 10, y - 28); ctx.moveTo(x + 10, y - 10); ctx.lineTo(x + 10, y - 28); ctx.stroke();
      poly([[x - 15, y - 26], [x, y - 38], [x + 15, y - 26], [x, y - 21]], '#c4553a');
      return { a: 16, top: 40 };
    },
    garden(x, y, burnt) {
      poly([[x - 24, y], [x, y + 12], [x + 24, y], [x, y - 12]], burnt ? '#4d4038' : '#8a5a36');
      if (burnt) { for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? '#2c2420' : '#6b5b52'; ctx.beginPath(); ctx.arc(x - 14 + k * 4.5, y - 3 + (k % 3) * 3, 2.5, 0, 7); ctx.fill(); } return { a: 24, top: 14 }; }
      const cols = ['#ff6b8a', '#ffd84a', '#ffffff', '#c77dff', '#ff8f4a'];
      for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) {
        const t1 = (k + 0.5) / 5, u = (r + 0.5) / 4, px = x - 24 + t1 * 24 + u * 24, py = y + t1 * 12 - u * 12;
        ctx.fillStyle = '#3f8f3d'; ctx.fillRect(px - 0.5, py - 5, 1, 5);
        ctx.fillStyle = cols[(r * 5 + k) % 5]; ctx.beginPath(); ctx.arc(px, py - 6, 2.6, 0, 7); ctx.fill();
      }
      return { a: 24, top: 16 };
    },
    tree(x, y, seed) {
      const s = 0.85 + ((seed * 37) % 10) / 30;
      shadow(x, y, 9 * s, 4.5 * s);
      ctx.fillStyle = '#7a4b2a'; ctx.fillRect(x - 2, y - 12 * s, 4, 12 * s);
      [[0, -24, 11, '#4fa64a'], [-6, -18, 8, '#3f8f3d'], [6, -17, 8, '#5fb85a'], [1, -29, 7, '#6cc464']].forEach(([dx, dy, r, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7); ctx.fill(); });
      return { a: 12, top: 36 };
    },
    pond(x, y) {
      ctx.fillStyle = '#4f9fe0'; ctx.beginPath(); ctx.ellipse(x, y, 22, 10, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#cbe9ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x - 4, y - 1, 8 + Math.sin(T * 2) * 2, 3, 0, 0, Math.PI); ctx.stroke();
      ctx.fillStyle = '#5fb85a'; ctx.beginPath(); ctx.ellipse(x + 9, y + 2, 4, 2, 0, 0, 7); ctx.fill();
      return { a: 0, top: 0 };
    },
    plot(x, y, def) {
      poly([[x - 22, y], [x, y + 11], [x + 22, y], [x, y - 11]], '#b98a5c');
      ctx.font = '900 7px "Nunito Sans",sans-serif';
      const label = def.name.toUpperCase(), sw = ctx.measureText(label).width + 8;
      ctx.fillStyle = '#7a4b2a'; ctx.fillRect(x - 1.5, y - 22, 3, 20);
      ctx.fillStyle = '#e9c48f'; ctx.fillRect(x - sw / 2, y - 30, sw, 11); ctx.strokeStyle = '#7a4b2a'; ctx.lineWidth = 1; ctx.strokeRect(x - sw / 2, y - 30, sw, 11);
      const p = reduce ? 0 : Math.sin(T * 3) * 2, can = canAfford(S.res, def.cost), bx = x + sw / 2 + 6;
      ctx.fillStyle = can ? '#5fb85a' : '#c9b79f'; ctx.beginPath(); ctx.arc(bx, y - 36 + p, 8, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(bx - 4, y - 36 + p); ctx.lineTo(bx + 4, y - 36 + p); ctx.moveTo(bx, y - 40 + p); ctx.lineTo(bx, y - 32 + p); ctx.stroke();
      ctx.fillStyle = '#3a2a1c'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - 22);
      return { a: Math.max(24, sw / 2 + 14), top: 46 };
    },
  };

  function entities() {
    const list = [];
    BUILDINGS.forEach((b) => list.push({ kind: 'building', id: b.id, def: b, i: b.i, j: b.j }));
    memberList(S).forEach((m, k) => {
      const slot = HOUSE_SLOTS[k]; if (!slot) return;
      list.push({ kind: 'house', id: `house:${m.id}`, member: m, i: slot[0], j: slot[1] });
    });
    const used = new Set(list.map((e) => `${e.i},${e.j}`));
    SCENERY.forEach(([type, i, j], k) => { if (!used.has(`${i},${j}`)) list.push({ kind: type, id: `${type}${k}`, i, j, seed: i * 7 + j }); });
    return list.sort((A, B) => (A.i + A.j) - (B.i + B.j) || A.i - B.i);
  }

  const cloud = (x, y, s) => { ctx.fillStyle = 'rgba(255,255,255,.85)'; [[0, 0, 14], [14, -5, 12], [28, 0, 13], [14, 4, 12]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7); ctx.fill(); }); };
  const bossPos = () => ({ x: 220 + Math.sin(T * 0.6) * 18, y: 182 + (reduce ? 0 : Math.sin(T * 1.6) * 5) });

  function drawBoss(frac) {
    if (bossGone || !S) return;
    const B = bossFor(S.week.bossIndex), p = bossPos();
    const x = p.x + (bossShake ? (Math.random() - 0.5) * bossShake : 0), y = p.y;
    const r = 20 + 24 * Math.max(frac, 0.15);
    ctx.fillStyle = 'rgba(40,20,60,.18)'; ctx.beginPath(); ctx.ellipse(x, OY + 75, r * 1.2, r * 0.45, 0, 0, 7); ctx.fill();
    for (let k = 5; k > 0; k--) { ctx.fillStyle = sh(B.body, -0.05 * k); ctx.beginPath(); ctx.arc(x - r * 0.9 - k * r * 0.28, y + Math.sin(T * 3 + k) * 4 + k * 2, r * (0.55 - k * 0.07), 0, 7); ctx.fill(); }
    ctx.fillStyle = bossFlash > 0 ? '#fff' : B.body;
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + T * 0.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.5, r * 0.45, 0, 7); ctx.fill(); }
    ctx.fillStyle = bossFlash > 0 ? '#fff' : B.belly; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 7); ctx.fill();
    const horn = sh(B.body, -0.35);
    poly([[x - r * 0.5, y - r * 0.45], [x - r * 0.75, y - r * 1.05], [x - r * 0.25, y - r * 0.6]], horn);
    poly([[x + r * 0.5, y - r * 0.45], [x + r * 0.75, y - r * 1.05], [x + r * 0.25, y - r * 0.6]], horn);
    const blink = Math.sin(T * 1.3) > 0.97 ? 0.15 : 1;
    [-1, 1].forEach((sd) => {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + sd * r * 0.3, y - r * 0.12, r * 0.17, r * 0.2 * blink, 0, 0, 7); ctx.fill();
      ctx.fillStyle = B.eye; ctx.beginPath(); ctx.arc(x + sd * r * 0.28, y - r * 0.08, r * 0.09 * blink, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3a2440'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + sd * r * 0.12, y - r * 0.3); ctx.lineTo(x + sd * r * 0.46, y - r * 0.4); ctx.stroke();
    });
    ctx.fillStyle = '#3a2440'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.28, r * 0.26, r * 0.12, 0, 0, Math.PI); ctx.fill();
    poly([[x - r * 0.12, y + r * 0.28], [x - r * 0.05, y + r * 0.28], [x - r * 0.085, y + r * 0.4]], '#fff');
  }

  const burst = (x, y, cols, n = 18, spd = 3, g = 0.08) => { for (let k = 0; k < n; k++) { const a = Math.random() * 7, v = Math.random() * spd + 1; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 1, col: cols[k % cols.length], r: 2 + Math.random() * 3, g }); } };

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8fd3ff'); g.addColorStop(0.55, '#d8f1ff'); g.addColorStop(1, '#bfe6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    clouds.forEach((c) => { c.x += dt * 6 * c.s; if (c.x > W + 40) c.x = -60; cloud(c.x, c.y, c.s); });
    ctx.fillStyle = '#a8dba0'; ctx.beginPath(); ctx.ellipse(90, 240, 150, 50, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#9ad192'; ctx.beginPath(); ctx.ellipse(360, 247, 140, 44, 0, Math.PI, 0); ctx.fill();
    if (S) {
      const L = iso(0, N - 1), R = iso(N - 1, 0), F = iso(N - 1, N - 1);
      poly([[L.x - TW / 2, L.y], [F.x, F.y + TH / 2], [F.x, F.y + TH / 2 + 22], [L.x - TW / 2, L.y + 22]], '#9b6b43');
      poly([[F.x, F.y + TH / 2], [R.x + TW / 2, R.y], [R.x + TW / 2, R.y + 22], [F.x, F.y + TH / 2 + 22]], '#7c522f');
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const p = iso(i, j), path = i === 3 || j === 3;
        const c = path ? ((i + j) % 2 ? '#ead39b' : '#e3c98d') : ((i + j) % 2 ? '#8fd16a' : '#84c862');
        poly([[p.x - TW / 2, p.y], [p.x, p.y + TH / 2], [p.x + TW / 2, p.y], [p.x, p.y - TH / 2]], c);
        if (!path && (i * 7 + j * 3) % 5 === 0) { ctx.fillStyle = '#6fb84f'; ctx.fillRect(p.x - 6, p.y - 2, 1.5, 4); ctx.fillRect(p.x + 5, p.y + 1, 1.5, 4); }
      }
      chimneys = []; hits = [];
      const labels = [];
      for (const e of entities()) {
        const p = iso(e.i, e.j); let bb;
        ctx.save();
        if (pop[e.id] > 0) {
          const k = pop[e.id], s = 1 + Math.sin((1 - k) * Math.PI) * 0.25 - (k > 0.85 ? (k - 0.85) * 4 : 0);
          ctx.translate(p.x, p.y); ctx.scale(Math.max(0.2, s), Math.max(0.2, s)); ctx.translate(-p.x, -p.y);
          pop[e.id] = Math.max(0, k - dt * 1.6);
        }
        if (e.kind === 'house') { bb = draw.house(p.x, p.y, S.houses?.[e.member.id] || 1, e.member.color); labels.push([e.member, p]); }
        else if (e.kind === 'tree') bb = draw.tree(p.x, p.y, e.seed);
        else if (e.kind === 'pond') bb = draw.pond(p.x, p.y);
        else {
          const st = S.buildings?.[e.id] || {};
          if (!st.built) bb = draw.plot(p.x, p.y, e.def);
          else if (e.id === 'garden') bb = draw.garden(p.x, p.y, st.burnt);
          else bb = draw[e.def.type](p.x, p.y, st.lvl || 1);
        }
        ctx.restore();
        if (sel === e.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(p.x, p.y, bb.a + 4, (bb.a + 4) / 2, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
        if (e.kind === 'house' || e.kind === 'building') hits.push({ id: e.id, x1: p.x - bb.a, x2: p.x + bb.a, y1: p.y - bb.top, y2: p.y + 14 });
      }
      labels.forEach(([m, p]) => {
        ctx.font = '900 9px "Nunito Sans",sans-serif'; const w = ctx.measureText(m.name).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(p.x - w / 2, p.y + 8, w, 12, 6); else ctx.rect(p.x - w / 2, p.y + 8, w, 12);
        ctx.fill(); ctx.fillStyle = m.color; ctx.textAlign = 'center'; ctx.fillText(m.name, p.x, p.y + 17);
      });
      if (!reduce) chimneys.forEach(([x, y]) => { if (Math.random() < 0.06) parts.push({ x, y, vx: 0.2 + Math.random() * 0.2, vy: -0.5, life: 1, col: 'rgba(255,255,255,.7)', r: 3, g: 0, smoke: 1 }); });
      const M = maxHP(S) || 1, target = Math.max(0, M - dealt(S));
      if (shownHP === null) shownHP = target;
      if (!shots.length) shownHP = target; // keep in step with the data when nothing is in flight
      drawBoss(shownHP / M);
      bossShake = Math.max(0, bossShake - dt * 30); bossFlash = Math.max(0, bossFlash - dt);
      shots = shots.filter((s) => {
        s.k += dt / s.dur; const bp = bossPos(), k = Math.min(1, s.k);
        const x = s.x0 + (bp.x - s.x0) * k, y = s.y0 + (bp.y - s.y0) * k - Math.sin(k * Math.PI) * 70;
        ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
        if (Math.random() < 0.7) parts.push({ x, y, vx: Math.random() - 0.5, vy: Math.random() - 0.5, life: 0.6, col: s.col, r: 2.5, g: 0 });
        if (s.k >= 1) {
          shownHP = Math.max(0, shownHP - s.dmg); bossShake = 10; bossFlash = 0.12;
          burst(bp.x, bp.y, [s.col, '#fff', '#f5c542'], 22, 3.5); floats.push({ x: bp.x, y: bp.y - 30, txt: `-${s.dmg}`, life: 1 });
          if (shownHP <= 0 && M > 1 && !bossGone) { bossGone = true; burst(bp.x, bp.y, ['#f5c542', '#ff7a3d', '#fff', '#9b8fb8'], 60, 6); floats.push({ x: bp.x, y: bp.y, txt: 'Defeated!', life: 1.6 }); }
          return false;
        }
        return true;
      });
      if (!shots.length && target > 0) bossGone = false;
      if (!shots.length && target <= 0 && maxHP(S) > 0) bossGone = true;
    }
    parts = parts.filter((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= p.smoke ? 0.012 : 0.022; if (p.smoke) p.r += 0.06;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      return p.life > 0;
    });
    floats = floats.filter((f) => {
      f.y -= 0.6; f.life -= 0.015; ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      ctx.font = '900 22px Grandstander, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#3a2440';
      ctx.strokeText(f.txt, f.x, f.y); ctx.fillStyle = '#ffd84a'; ctx.fillText(f.txt, f.x, f.y); ctx.globalAlpha = 1;
      return f.life > 0;
    });
    raf = requestAnimationFrame(frame);
  }

  const onClick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H;
    const h = [...hits].reverse().find((b) => x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2);
    sel = h ? h.id : null;
    onTap?.(sel);
  };
  canvas.addEventListener('click', onClick);
  raf = requestAnimationFrame(frame);

  const housePos = (memberId) => {
    const k = (S?.memberOrder || []).indexOf(memberId); const slot = HOUSE_SLOTS[k];
    return slot ? iso(slot[0], slot[1]) : { x: 220, y: 380 };
  };
  const entityPos = (id) => {
    if (id.startsWith('house:')) return housePos(id.slice(6));
    const b = BUILDINGS.find((x) => x.id === id); return b ? iso(b.i, b.j) : { x: 220, y: 300 };
  };

  return {
    setState(next) {
      const key = `${next.week?.id}:${next.week?.bossIndex}`;
      if (key !== bossKey) { bossKey = key; shownHP = null; bossGone = false; shots = []; }
      S = next;
    },
    select(id) { sel = id; },
    shoot(memberId, dmg, color) {
      const p = housePos(memberId);
      if (reduce) { shownHP = Math.max(0, (shownHP ?? 0) - dmg); return; }
      if (shownHP === null && S) shownHP = Math.max(0, maxHP(S) - dealt(S) + dmg);
      shots.push({ x0: p.x, y0: p.y - 40, k: 0, dur: 0.9, dmg, col: color });
    },
    floatText(entityId, txt) { const p = entityPos(entityId); floats.push({ x: p.x, y: p.y - 30, txt, life: 1 }); },
    celebrateBuild(entityId) { pop[entityId] = 1; const p = entityPos(entityId); burst(p.x, p.y - 15, ['#e9c48f', '#fff', '#f5c542'], 26, 3); },
    confetti() { for (let k = 0; k < 4; k++) setTimeout(() => burst(80 + Math.random() * 280, 140 + Math.random() * 120, ['#f5c542', '#ff7a3d', '#5fb85a', '#3f6fb5', '#fff'], 30, 5), k * 250); },
    fire(entityId) { const p = entityPos(entityId); for (let k = 0; k < 6; k++) setTimeout(() => burst(p.x + (Math.random() - 0.5) * 30, p.y - 6, ['#ff7a3d', '#ffb15c', '#d9483b', '#555'], 14, 2.5, -0.04), k * 150); },
    destroy() { running = false; cancelAnimationFrame(raf); canvas.removeEventListener('click', onClick); },
  };
}
