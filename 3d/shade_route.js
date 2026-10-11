// ============================================================
// 🌳 走陰涼路線（南港院區）
// - 選日期與時間（拖曳天空中的太陽）→ 依太陽位置算出建築影子，3D 場景的陽光與影子也跟著移動
// - 遮蔭 = 樹冠（衛星樹冠高度圖，樹蔭計算.py 預先算好的每段比例 s）＋當下的建築影子
// - 同時算「最短路線」與「陰涼路線」，比較距離、時間、遮蔭比例；路線上綠色＝有遮蔭、橘色＝曬太陽
// 資料：3d/data/route.js（window.CAMPUS_ROUTE：節點 n、邊 e、樹蔭 s，由 sync_3d.py 從 2D 路網複製）
// 依賴：main.js（MAP3D.sun / sunTarget / look / buildingShapes / heightAt / addOverlay）、ui_extras.js（接待處帳篷、頂部按鈕）
// ============================================================
(function () {
  const M = window.MAP3D, G = window.CAMPUS_ROUTE;
  if (!M || !G || !M.sun) return;

  const LAT0 = G.o[0], LNG0 = G.o[1];
  const WALK_M_PER_MIN = 67;       // 院區人多、邊走邊看，約時速 4 公里（與 2D 步行路線相同）
  const CLIMB_FACTOR = 10;          // 每爬升 1 公尺約等於多走 10 公尺
  const SHADE_WEIGHT = 2.0;         // 陰涼路線：曬太陽的路段算成多遠（1 公尺曬太陽 ≈ 1 + 2 = 3 公尺有遮蔭）
  const CELL = 2;                   // 建築影子網格（公尺）
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 路網 ----------
  const NN = G.n.length / 3;
  const NX = new Float64Array(NN), NZ = new Float64Array(NN), NH = new Float64Array(NN);
  for (let i = 0; i < NN; i++) { NX[i] = G.n[i * 3]; NZ[i] = G.n[i * 3 + 1]; NH[i] = G.n[i * 3 + 2]; }
  const NE = G.e.length / 2;
  const EU = new Int32Array(NE), EV = new Int32Array(NE), EL = new Float64Array(NE), TREE = new Float64Array(NE);
  const ADJ = Array.from({ length: NN }, () => []);
  for (let k = 0; k < NE; k++) {
    const u = G.e[k * 2], v = G.e[k * 2 + 1];
    EU[k] = u; EV[k] = v; EL[k] = Math.hypot(NX[u] - NX[v], NZ[u] - NZ[v]);
    TREE[k] = G.s && G.s[k] != null ? G.s[k] / 100 : 0;
    ADJ[u].push(v, k); ADJ[v].push(u, k);
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < NN; i++) { minX = Math.min(minX, NX[i]); maxX = Math.max(maxX, NX[i]); minZ = Math.min(minZ, NZ[i]); maxZ = Math.max(maxZ, NZ[i]); }
  minX -= 50; minZ -= 50; maxX += 50; maxZ += 50;
  const GW = Math.ceil((maxX - minX) / CELL), GH = Math.ceil((maxZ - minZ) / CELL);
  const grid = new Uint8Array(GW * GH);

  // ---------- 太陽位置（NOAA 簡化公式；台灣時間 UTC+8）----------
  const RAD = Math.PI / 180;
  function sunAt(y, mo, d, minutes) {
    const t = Date.UTC(y, mo - 1, d, 0, minutes) - 8 * 3600e3;
    const n = t / 86400e3 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * n) * RAD, q = 280.459 + 0.98564736 * n;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * n) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    const H = (gmst * 15 + LNG0) * RAD - ra, lat = LAT0 * RAD;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    return { el: el / RAD, az: ((az / RAD) + 360) % 360 };
  }
  const DIR8 = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
  const dirName = az => DIR8[Math.round(az / 45) % 8];

  // ---------- 建築影子：每棟建築輪廓沿著背向太陽的方向拉長，取凸包填進網格 ----------
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function inConvex(poly, x, z) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if ((poly[i][0] - poly[j][0]) * (z - poly[j][1]) - (poly[i][1] - poly[j][1]) * (x - poly[j][0]) < 0) return false;
    }
    return true;
  }
  function buildShadows(sun) {
    grid.fill(0);
    if (sun.el <= 0.5) return;
    const L = Math.min(400, 1 / Math.tan(sun.el * RAD));          // 每 1 公尺高的影子長度
    const ox = -Math.sin(sun.az * RAD), oz = Math.cos(sun.az * RAD); // 影子方向（背向太陽；z 軸朝南）
    M.buildingShapes.forEach(b => {
      const len = Math.min(400, b.h * L);
      const poly = hull(b.p.concat(b.p.map(([x, z]) => [x + ox * len, z + oz * len])));
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      poly.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
      const c0 = Math.max(0, Math.floor((x0 - minX) / CELL)), c1 = Math.min(GW - 1, Math.floor((x1 - minX) / CELL));
      const r0 = Math.max(0, Math.floor((z0 - minZ) / CELL)), r1 = Math.min(GH - 1, Math.floor((z1 - minZ) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (!grid[r * GW + c] && inConvex(poly, minX + (c + 0.5) * CELL, minZ + (r + 0.5) * CELL)) grid[r * GW + c] = 1;
      }
    });
  }
  const BLD = new Float64Array(NE), SHADE = new Float64Array(NE);
  let night = false;
  function computeShade(sun) {
    night = sun.el <= 0.5;
    buildShadows(sun);
    for (let k = 0; k < NE; k++) {
      if (night) { BLD[k] = 1; SHADE[k] = 1; continue; }
      const u = EU[k], v = EV[k], steps = Math.max(1, Math.round(EL[k] / CELL));
      let hit = 0;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, x = NX[u] + (NX[v] - NX[u]) * t, z = NZ[u] + (NZ[v] - NZ[u]) * t;
        const c = Math.floor((x - minX) / CELL), r = Math.floor((z - minZ) / CELL);
        if (c >= 0 && r >= 0 && c < GW && r < GH && grid[r * GW + c]) hit++;
      }
      BLD[k] = hit / (steps + 1);
      SHADE[k] = 1 - (1 - TREE[k]) * (1 - BLD[k]);                // 樹蔭或建築影子其一就算遮蔭
    }
  }

  // ---------- 最短路徑（起終點以直線連到附近路網）----------
  function nearNodes(x, z) {
    const out = []; let bi = 0, bd = Infinity;
    for (let i = 0; i < NN; i++) { const d = Math.hypot(NX[i] - x, NZ[i] - z); if (d < 80) out.push([i, d]); if (d < bd) { bd = d; bi = i; } }
    return out.length ? out : [[bi, bd]];
  }
  function route(from, to, shaded) {
    const cost = k => shaded ? EL[k] * (1 + SHADE_WEIGHT * (1 - SHADE[k])) : EL[k];
    const src = nearNodes(from.x, from.z), dst = new Map(nearNodes(to.x, to.z));
    const dist = new Float64Array(NN).fill(Infinity), prev = new Int32Array(NN).fill(-1), pe = new Int32Array(NN).fill(-1);
    const heap = [];
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    src.forEach(([i, d]) => { if (d * 1.3 < dist[i]) { dist[i] = d * 1.3; push(dist[i], i); } });
    let best = Infinity, end = -1;
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      if (d >= best) break;
      if (dst.has(u) && d + dst.get(u) * 1.3 < best) { best = d + dst.get(u) * 1.3; end = u; }
      const a = ADJ[u];
      for (let j = 0; j < a.length; j += 2) {
        const v = a[j], k = a[j + 1], nd = d + cost(k);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pe[v] = k; push(nd, v); }
      }
    }
    if (end < 0) return null;
    const nodes = [], edges = [];
    for (let u = end; u >= 0; u = prev[u]) { nodes.unshift(u); if (pe[u] >= 0) edges.unshift(pe[u]); }
    let len = Math.hypot(NX[nodes[0]] - from.x, NZ[nodes[0]] - from.z) + Math.hypot(NX[end] - to.x, NZ[end] - to.z), shadeLen = 0;
    edges.forEach(k => { len += EL[k]; shadeLen += EL[k] * SHADE[k]; });
    const roadLen = edges.reduce((a, k) => a + EL[k], 0) || 1;
    let climb = 0;
    for (let i = 1; i < nodes.length; i++) { const dh = NH[nodes[i]] - NH[nodes[i - 1]]; if (dh > 0) climb += dh; }
    return { nodes, edges, len, climb, shade: shadeLen / roadLen, min: Math.max(1, Math.ceil((len + climb * CLIMB_FACTOR) / WALK_M_PER_MIN)) };
  }

  // ---------- 路線說明（與 2D 步行路線相同的做法）：路口轉彎＋沿路建築當地標，每段標出遮蔭 ----------
  const NAME_ALIAS = { '近史所': '近代史研究所', '統計所': '統計科學研究所', '跨領域大樓': '跨領域科技研究大樓' };
  const SKIP_MARK = new Set(['警衛室', '動物房', '環安衛小組', '歸國學人宿舍', '國家實驗動物中心']);
  const norm = n => String(n || '').replace(/台/g, '臺').replace(/[（(][^）)]*[）)]/g, '').replace(/[\s　]+/g, '');
  const disp = n => String(n || '').replace(/[（(][^）)]*[）)]/g, '').replace(/[\s　]+/g, ' ').trim();
  const sameName = (a, b) => { a = norm(a); b = norm(b); return !!(a && b && (a === b || a.includes(b) || b.includes(a))); };
  const LANDMARKS = [];
  ((window.CAMPUS_BUILDINGS || {}).buildings || []).forEach(b => {
    let name = (b.n || '').trim(); name = NAME_ALIAS[name] || name;
    if (!name || SKIP_MARK.has(name)) return;
    let lm = LANDMARKS.find(l => l.name === name);
    if (!lm) { lm = { name, rings: [], cx: 0, cz: 0, c: 0 }; LANDMARKS.push(lm); }
    lm.rings.push(b.p); b.p.forEach(([x, z]) => { lm.cx += x; lm.cz += z; lm.c++; });
  });
  LANDMARKS.forEach(l => { l.cx /= l.c; l.cz /= l.c; });
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  }
  function distToLandmark(px, pz, lm) {
    let best = Infinity;
    lm.rings.forEach(r => {
      let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if ((r[i][1] > pz) !== (r[j][1] > pz) && px < (r[j][0] - r[i][0]) * (pz - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
        best = Math.min(best, segDist(px, pz, r[j][0], r[j][1], r[i][0], r[i][1]));
      }
      if (inside) best = 0;
    });
    return best;
  }
  const heading = (ax, az, bx, bz) => Math.atan2(-(bz - az), bx - ax);
  const angleDiff = (a, b) => { let d = (b - a) / RAD; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };   // 正＝左轉
  const sideOf = (ax, az, bx, bz, px, pz) => ((bx - ax) * -(pz - az) - -(bz - az) * (px - ax)) > 0 ? '左' : '右';
  const fmtM = m => m >= 1000 ? (m / 1000).toFixed(1) + ' 公里' : Math.max(10, Math.round(m / 10) * 10) + ' 公尺';
  const degree = i => ADJ[i].length / 2;
  function eventsOnDay(loc, day) {
    return (loc.events || []).map(id => M.events && M.events[id]).filter(e => e && (
      day === '11/14' ? (e.theme || '').startsWith('南') : ((e.days_held_display || '').includes(day) || (e.days_held || []).includes(day))));
  }
  function describe(r, from, to) {
    const P = [{ x: from.x, z: from.z, n: -1, k: -1 }].concat(r.nodes.map((n, i) => ({ x: NX[n], z: NZ[n], n, k: i ? r.edges[i - 1] : -1 }))).concat([{ x: to.x, z: to.z, n: -1, k: -1 }]);
    let s = 0;
    P.forEach((p, i) => { if (i) s += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z); p.s = s; });
    const total = s;
    const pointAt = d => {
      d = Math.max(0, Math.min(total, d));
      for (let i = 1; i < P.length; i++) if (P[i].s >= d) { const a = P[i - 1], b = P[i], t = (d - a.s) / ((b.s - a.s) || 1); return [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]; }
      return [P[P.length - 1].x, P[P.length - 1].z];
    };
    // 轉彎：只在路口（分岔 ≥ 3）且方向改變超過 35°
    const turns = [];
    for (let i = 1; i < P.length - 1; i++) {
      const p = P[i];
      if (p.n < 0 || degree(p.n) < 3 || p.s < 12 || total - p.s < 12) continue;
      const [bx, bz] = pointAt(p.s - 15), [fx, fz] = pointAt(p.s + 15);
      const d = angleDiff(heading(bx, bz, p.x, p.z), heading(p.x, p.z, fx, fz));
      if (Math.abs(d) < 35) continue;
      const last = turns[turns.length - 1];
      if (last && p.s - last.s < 20) { if (Math.abs(d) > Math.abs(last.deg)) Object.assign(last, { s: p.s, x: p.x, z: p.z, deg: d }); continue; }
      turns.push({ s: p.s, x: p.x, z: p.z, deg: d });
    }
    turns.forEach(t => { const a = Math.abs(t.deg), lr = t.deg > 0 ? '左' : '右'; t.word = a > 150 ? '迴轉' : a < 60 ? `稍向${lr}轉` : `${lr}轉`; });
    // 沿路地標：建築輪廓 32 公尺內、活動館舍 52 公尺內
    const seen = new Map();
    const consider = (name, d, at, side, place) => {
      if (sameName(name, from.name) || sameName(name, to.name)) return;
      const key = [...seen.keys()].find(k => sameName(k, name));
      if (key) { const o = seen.get(key); if (d < o.d) Object.assign(o, { d, s: at, side }); if (place) { o.place = place; if (key !== name) { seen.delete(key); seen.set(name, Object.assign(o, { name })); } } return; }
      seen.set(name, { name, d, s: at, side, place });
    };
    LANDMARKS.forEach(lm => {
      let bd = Infinity, bs = 0, bi = 1;
      for (let i = 1; i < P.length - 1; i++) { const d = distToLandmark(P[i].x, P[i].z, lm); if (d < bd) { bd = d; bs = P[i].s; bi = i; } }
      if (bd < 32) consider(lm.name, bd, bs, sideOf(P[bi - 1].x, P[bi - 1].z, P[bi + 1].x, P[bi + 1].z, lm.cx, lm.cz), null);
    });
    (M.campusLocs || []).forEach(l => {
      if (l.south || l.remote) return;
      let bd = Infinity, bs = 0, bi = 1;
      for (let i = 1; i < P.length; i++) { const d = segDist(l.x, l.y, P[i - 1].x, P[i - 1].z, P[i].x, P[i].z); if (d < bd) { bd = d; bs = P[i].s; bi = i; } }
      if (bd < 52) consider(l.name, bd, bs, sideOf(P[bi - 1].x, P[bi - 1].z, P[bi].x, P[bi].z, l.x, l.y), l);
    });
    const marks = [...seen.values()].sort((a, b) => a.s - b.s);
    const nearMark = d => { let best = null; marks.forEach(m => { const dd = Math.abs(m.s - d); if (dd < 35 && m.d < 40 && (!best || dd + m.d < Math.abs(best.s - d) + best.d)) best = m; }); return best; };
    // 每一段的遮蔭比例（依路段長度加權）
    const shadeBetween = (a, b) => {
      let len = 0, sh = 0;
      for (let i = 1; i < P.length; i++) {
        const k = P[i].k; if (k < 0) continue;
        const ov = Math.min(b, P[i].s) - Math.max(a, P[i - 1].s);
        if (ov > 0) { len += ov; sh += ov * SHADE[k]; }
      }
      return len ? sh / len : null;
    };
    const stops = [0].concat(turns.map(t => t.s)).concat([total]);
    const turnMarks = turns.map(t => nearMark(t.s));
    const steps = [];
    for (let k = 0; k < stops.length - 1; k++) {
      const a = stops[k], b = stops[k + 1];
      const atTurn = [turnMarks[k - 1], turnMarks[k]].filter(Boolean);
      let passing = marks.filter(m => m.s > a + 5 && m.s <= b + 5 && (k === stops.length - 2 || m.s < b - 8) && !atTurn.includes(m));
      const more = passing.length > 3;
      if (more) {
        const len = (b - a) / 3;
        passing = [0, 1, 2].map(i => passing.filter(m => m.s >= a + i * len - 5 && m.s < a + (i + 1) * len + 5).sort((x, y) => x.d - y.d)[0]).filter((m, i, arr) => m && arr.indexOf(m) === i);
      }
      const head = k === 0 ? `從 <b>${esc(disp(from.name))}</b> 出發`
        : `${turnMarks[k - 1] ? `在 <b>${esc(disp(turnMarks[k - 1].name))}</b> 附近` : '在路口'}<b class="turn">${turns[k - 1].word}</b>`;
      const sh = shadeBetween(a, b);
      const icon = k === 0 ? '🚶' : Math.abs(turns[k - 1].deg) > 150 ? '↩️' : turns[k - 1].deg > 0 ? '⬅️' : '➡️';
      steps.push({ s: a, at: pointAt(a), icon, sh, html: `${head}，直走約 ${fmtM(b - a)}` +
        (passing.length ? `<small>會經過 ${passing.map(m => esc(disp(m.name)) + (m.side ? `（${m.side}）` : '')).join('、')}${more ? ' 等' : ''}</small>` : '') });
    }
    steps.push({ s: total, at: [to.x, to.z], icon: '🏁', sh: null, html: `抵達 <b>${esc(disp(to.name))}</b>` });
    return { steps, marks };
  }

  // ---------- 起點／終點 ----------
  function receptions(day) {
    const byLetter = {};
    (M.receptionTents || []).forEach(t => {
      if (t.f.campus === 'south' || !t.letter) return;
      (byLetter[t.letter] = byLetter[t.letter] || []).push(t);
    });
    return Object.keys(byLetter).sort().map(letter => {
      const list = byLetter[letter];
      const t = list.find(i => (i.f.days || []).includes(day)) || list.find(i => (i.f.days || []).includes('10/17')) || list[0];
      return { key: 'rc:' + letter, name: '接待處' + letter, x: t.f.x, z: t.f.y };
    });
  }
  const places = () => (M.campusLocs || []).filter(l => !l.south && !l.remote).map(l => ({ key: 'loc:' + l.name, name: l.name, x: l.x, z: l.y }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  // ---------- 介面 ----------
  const css = document.createElement('style');
  css.textContent = `
  .sr-panel { position: absolute; z-index: 30; top: 72px; right: var(--gutter, 16px); bottom: var(--gutter, 16px); width: min(390px, calc(100vw - 32px)); overflow-y: auto;
    background: linear-gradient(160deg, rgba(14, 34, 72, 0.86), rgba(6, 16, 36, 0.8)); border: 1px solid rgba(94, 242, 255, 0.3); border-radius: 14px;
    backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%); box-shadow: 0 12px 40px rgba(0,0,0,.5); color: var(--text, #e6f4ff); padding: 12px 14px; display: none; font-size: 13px; }
  .sr-panel.open { display: block; }
  .sr-head { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 15px; margin: -4px -6px 8px; padding: 4px 6px; border-radius: 8px; cursor: move; user-select: none; touch-action: none; }
  .sr-head:hover { background: rgba(94,242,255,.06); }
  .sr-head .grip { color: var(--muted, #8fb3d9); font-size: 12px; letter-spacing: -2px; }
  .sr-head .hb { background: none; border: 0; color: var(--muted, #8fb3d9); font-size: 17px; cursor: pointer; padding: 0 4px; line-height: 1; }
  .sr-head .hb:hover { color: var(--cyan, #5ef2ff); }
  .sr-head .hb.min { margin-left: auto; }
  .sr-mini { display: none; font-size: 12.5px; color: var(--muted, #8fb3d9); }
  .sr-mini b { color: var(--gold, #ffd36e); }
  .sr-panel.min { overflow: hidden; bottom: auto; }
  .sr-panel.moved { bottom: auto; max-height: calc(100vh - 90px); }
  @media (max-width: 1280px) { .sr-panel { width: min(340px, calc(100vw - 32px)); } }
  .sr-panel.min > :not(.sr-head):not(.sr-mini) { display: none; }
  .sr-panel.min .sr-mini { display: block; }
  .sr-panel.min .sr-head { margin-bottom: 2px; }
  .sr-panel details.sr-about { margin-top: 8px; font-size: 11.5px; color: var(--muted, #8fb3d9); }
  .sr-panel details.sr-about summary { cursor: pointer; }
  .sr-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: end; }
  .sr-row label { display: block; font-size: 11px; color: var(--muted, #8fb3d9); margin-bottom: 2px; }
  .sr-panel select, .sr-panel input[type=date] { width: 100%; background: rgba(6,16,36,.7); color: inherit; border: 1px solid rgba(94,242,255,.3); border-radius: 8px; padding: 5px 6px; font: inherit; color-scheme: dark; }
  .sr-swap { background: rgba(94,242,255,.1); border: 1px solid rgba(94,242,255,.3); color: var(--cyan, #5ef2ff); border-radius: 8px; padding: 5px 8px; cursor: pointer; height: 31px; }
  .sr-days { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 10px 0 4px; }
  .sr-days button { background: rgba(94,242,255,.08); border: 1px solid rgba(94,242,255,.25); color: inherit; border-radius: 999px; padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px; }
  .sr-days button.on { border-color: var(--gold, #ffd36e); color: var(--gold, #ffd36e); background: rgba(255,211,110,.12); }
  .sr-days input { width: 140px; }
  .sr-sky { width: 100%; height: auto; display: block; touch-action: none; user-select: none; }
  .sr-sky .knob { cursor: grab; } .sr-sky.drag .knob { cursor: grabbing; }
  .sr-sun { display: flex; gap: 8px; align-items: center; font-size: 12.5px; flex-wrap: wrap; }
  .sr-sun b { color: var(--gold, #ffd36e); font-size: 16px; }
  .sr-sun button { margin-left: auto; background: rgba(255,211,110,.12); border: 1px solid rgba(255,211,110,.4); color: var(--gold, #ffd36e); border-radius: 8px; padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px; }
  .sr-res { margin-top: 10px; display: grid; gap: 6px; }
  .sr-opt { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(94,242,255,.2); background: rgba(6,16,36,.45); cursor: pointer; }
  .sr-opt.on { border-color: var(--cyan, #5ef2ff); box-shadow: 0 0 12px rgba(94,242,255,.25); }
  .sr-opt .t { font-weight: 800; } .sr-opt .d { grid-column: 2; color: var(--muted, #8fb3d9); font-size: 12px; }
  .sr-bar { height: 6px; border-radius: 3px; background: rgba(255,154,60,.55); overflow: hidden; grid-column: 2; }
  .sr-bar i { display: block; height: 100%; background: #3ddc84; }
  .sr-note { color: var(--muted, #8fb3d9); font-size: 11.5px; margin-top: 8px; line-height: 1.5; }
  .sr-sec { margin-top: 10px; }
  .sr-sec h5 { margin: 0 0 4px; font-size: 12.5px; color: var(--cyan, #5ef2ff); }
  .sr-steps { list-style: none; margin: 0; padding: 0; }
  .sr-steps li { display: grid; grid-template-columns: 22px 1fr auto; gap: 6px; padding: 6px 4px; border-top: 1px dashed rgba(94,242,255,.18); cursor: pointer; line-height: 1.45; border-radius: 6px; }
  .sr-steps li:hover { background: rgba(94,242,255,.07); }
  .sr-steps li small { display: block; color: var(--muted, #8fb3d9); font-size: 11.5px; }
  .sr-steps .turn { color: var(--gold, #ffd36e); margin-left: 2px; }
  .sr-tag { font-size: 11px; white-space: nowrap; padding: 1px 6px; border-radius: 999px; align-self: start; }
  .sr-tag.y { background: rgba(61,220,132,.15); color: #3ddc84; } .sr-tag.n { background: rgba(255,154,60,.15); color: #ff9a3c; } .sr-tag.m { background: rgba(255,211,110,.12); color: var(--gold, #ffd36e); }
  .sr-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .sr-chip { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: rgba(94,242,255,.08); border: 1px solid rgba(94,242,255,.2); }
  .sr-chip.ev { background: rgba(255,211,110,.12); border-color: rgba(255,211,110,.45); color: var(--gold, #ffd36e); cursor: pointer; font-weight: 700; }
  .sr-legend { display: flex; gap: 12px; font-size: 11.5px; color: var(--muted, #8fb3d9); margin-top: 6px; }
  .sr-legend i { display: inline-block; width: 18px; height: 5px; border-radius: 3px; vertical-align: middle; margin-right: 4px; }
  .sr-pin { font: 800 12px/1 sans-serif; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,.6); pointer-events: none; }
  #btn-shade.on { border-color: #3ddc84; color: #3ddc84; box-shadow: 0 0 12px rgba(61,220,132,.45); }
  /* 遙控手把永遠在最上層；陰涼路線停靠在右側時，手把留在面板左邊（同活動清單展開時的位置），不被蓋住 */
  body.sr-open .nav { z-index: 40; }
  body.sr-docked .nav { right: calc(var(--gutter, 16px) + 402px); }
  body.sr-docked .about-link { right: calc(var(--gutter, 16px) + 402px); }
  body.sr-docked .attribution { right: calc(var(--gutter, 16px) + 412px); }
  @media (max-width: 1280px) { body.sr-docked .nav, body.sr-docked .about-link { right: calc(var(--gutter, 16px) + 352px); } body.sr-docked .attribution { right: calc(var(--gutter, 16px) + 362px); } }
  @media (max-width: 700px) { .sr-panel { top: auto !important; bottom: 8px; max-height: 60vh; } }`;
  document.head.appendChild(css);

  const panel = document.createElement('div');
  panel.className = 'sr-panel';
  panel.innerHTML = `
    <div class="sr-head" title="按住這裡可以拖曳移動"><span class="grip">⋮⋮</span>🌳 走陰涼路線<span style="font-weight:400;font-size:11px;color:var(--muted)">南港院區</span><button class="hb min" type="button" title="縮小／展開">—</button><button class="hb x" type="button" title="關閉">✕</button></div>
    <div class="sr-mini" id="srMini"></div>
    <div class="sr-row">
      <div><label>起點</label><select id="srFrom"></select></div>
      <button class="sr-swap" id="srSwap" title="對調">⇄</button>
      <div><label>終點（也可以直接點 3D 裡的館舍）</label><select id="srTo"></select></div>
    </div>
    <div class="sr-days" id="srDays">
      <button data-d="2026-10-03">10/03 兒童科普日</button><button data-d="2026-10-17" class="on">10/17 院區開放日</button><button data-d="today">今天</button>
      <input type="date" id="srDate" value="2026-10-17" title="選其他日期">
    </div>
    <svg class="sr-sky" id="srSky" viewBox="0 0 440 150"></svg>
    <div class="sr-sun" id="srSun"></div>
    <div class="sr-res" id="srRes"></div>
    <div class="sr-legend"><span><i style="background:#3ddc84"></i>有遮蔭（樹蔭或建築影子）</span><span><i style="background:#ff9a3c"></i>曬太陽</span></div>
    <details class="sr-about"><summary>說明</summary>樹蔭來自衛星樹冠高度圖（Meta／WRI，CC BY 4.0），建築影子依所選日期時間的太陽位置計算；未計入山坡地形的遮擋與最近新種、移除的樹，僅供參考。拖曳標題列可以移動這個面板，按「—」可以縮小。</details>`;
  document.body.appendChild(panel);
  ['pointerdown', 'wheel', 'touchstart'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
  const $ = s => panel.querySelector(s);

  // 頂部按鈕
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'btn-shade'; btn.type = 'button';
  btn.innerHTML = '<span style="font-size:14px">🌳</span><span class="txt">陰涼路線</span>';
  btn.title = '走陰涼路線：選時間，避開太陽';
  const anchor = document.getElementById('btn-share') || document.getElementById('btn-home');
  if (anchor) anchor.after(btn);

  // ---------- 狀態 ----------
  const st = { date: '2026-10-17', min: 14 * 60, mode: 'shade', from: '', to: '' };
  const dayKey = () => st.date.slice(5).replace('-', '/');
  function fillSelects() {
    const rc = receptions(dayKey()), pl = places();
    const opt = o => `<option value="${esc(o.key)}">${esc(o.name)}</option>`;
    const html = `<optgroup label="接待處">${rc.map(opt).join('')}</optgroup><optgroup label="館舍">${pl.map(opt).join('')}</optgroup>`;
    $('#srFrom').innerHTML = html;
    $('#srTo').innerHTML = '<option value="">選擇要去哪裡…</option>' + html;
    if (!st.from && rc.length) st.from = rc[0].key;
    $('#srFrom').value = st.from; $('#srTo').value = st.to;
  }
  const pointOf = key => [...receptions(dayKey()), ...places()].find(o => o.key === key) || null;

  // ---------- 天空與可拖曳的太陽 ----------
  const T0 = 5 * 60, T1 = 19 * 60, SX = 20, SW = 400, HY = 118, EL_SCALE = 1.05;   // x：5:00–19:00；y：仰角
  const tx = m => SX + (m - T0) / (T1 - T0) * SW;
  const ymd = () => { const d = st.date.split('-').map(Number); return [d[0], d[1], d[2]]; };
  const sunNow = () => { const [y, mo, d] = ymd(); return sunAt(y, mo, d, st.min); };
  function drawSky() {
    const [y, mo, d] = ymd();
    let path = '', rise = null, set = null, prevEl = null, peak = { el: -90, m: 720 };
    for (let m = T0; m <= T1; m += 10) {
      const s = sunAt(y, mo, d, m);
      path += `${path ? 'L' : 'M'}${tx(m).toFixed(1)},${(HY - Math.max(-8, s.el) * EL_SCALE).toFixed(1)}`;
      if (prevEl !== null && prevEl <= 0 && s.el > 0) rise = m;
      if (prevEl !== null && prevEl > 0 && s.el <= 0) set = m;
      if (s.el > peak.el) peak = { el: s.el, m };
      prevEl = s.el;
    }
    const s = sunNow(), sx = tx(st.min), sy = HY - Math.max(-8, s.el) * EL_SCALE;
    const fmt = m => m == null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const ticks = [6, 9, 12, 15, 18].map(h => `<line x1="${tx(h * 60)}" x2="${tx(h * 60)}" y1="${HY}" y2="${HY + 5}" stroke="rgba(143,179,217,.6)"/><text x="${tx(h * 60)}" y="${HY + 17}" fill="#8fb3d9" font-size="11" text-anchor="middle">${h}:00</text>`).join('');
    $('#srSky').innerHTML = `
      <defs><linearGradient id="srSkyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(76,141,255,.25)"/><stop offset="1" stop-color="rgba(255,211,110,.08)"/></linearGradient>
        <radialGradient id="srSunG"><stop offset="0" stop-color="#fff6c8"/><stop offset=".55" stop-color="#ffd36e"/><stop offset="1" stop-color="rgba(255,190,80,0)"/></radialGradient></defs>
      <rect x="${SX}" y="4" width="${SW}" height="${HY - 4}" rx="8" fill="url(#srSkyG)"/>
      <path d="${path}" fill="none" stroke="rgba(255,211,110,.55)" stroke-width="2" stroke-dasharray="4 4"/>
      <line x1="${SX}" x2="${SX + SW}" y1="${HY}" y2="${HY}" stroke="rgba(143,179,217,.7)"/>
      ${ticks}
      <text x="${SX + 4}" y="16" fill="#8fb3d9" font-size="10.5">日出 ${fmt(rise)}・正午最高仰角 ${peak.el.toFixed(0)}°・日落 ${fmt(set)}</text>
      <line x1="${sx}" x2="${sx}" y1="${sy}" y2="${HY}" stroke="rgba(255,211,110,.5)" stroke-dasharray="2 3"/>
      <g class="knob"><circle cx="${sx}" cy="${sy}" r="17" fill="url(#srSunG)" opacity="${s.el > 0 ? 1 : .35}"/><circle cx="${sx}" cy="${sy}" r="8" fill="${s.el > 0 ? '#ffd36e' : '#8fb3d9'}" stroke="#fff" stroke-width="1.5"/></g>`;
    const shadowX = s.el > 0.5 ? (1 / Math.tan(s.el * RAD)) : null;
    $('#srSun').innerHTML = `<b>${fmt(st.min)}</b><span>${s.el > 0.5 ? `太陽在${dirName(s.az)}方、仰角 ${s.el.toFixed(0)}°・影子約為高度的 ${shadowX.toFixed(1)} 倍` : '太陽已下山（沒有日曬，陰涼路線＝最短路線）'}</span>
      <button type="button" id="srPlay">${playing ? '⏸ 暫停' : '▶ 播放一天'}</button>`;
    $('#srPlay').onclick = togglePlay;
  }
  const sky = $('#srSky');
  function timeFromEvent(e) {
    const r = sky.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 440;
    return Math.round(Math.min(T1, Math.max(T0, T0 + (x - SX) / SW * (T1 - T0))) / 5) * 5;
  }
  let dragging = false;
  sky.addEventListener('pointerdown', e => { dragging = true; sky.classList.add('drag'); sky.setPointerCapture(e.pointerId); stopPlay(); setTime(timeFromEvent(e)); });
  sky.addEventListener('pointermove', e => { if (dragging) setTime(timeFromEvent(e)); });
  sky.addEventListener('pointerup', () => { dragging = false; sky.classList.remove('drag'); });
  sky.tabIndex = 0;
  sky.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setTime(Math.min(T1, Math.max(T0, st.min + (e.key === 'ArrowRight' ? 10 : -10)))); } });

  // ---------- 3D 場景的太陽 ----------
  const orig = { pos: M.sun.position.clone(), target: M.sun.target.position.clone(), intensity: M.sun.intensity };
  function applySun() {
    const s = sunNow(), T = M.sunTarget || M.sun.target.position;
    if (s.el > 0) {
      const e = s.el * RAD, a = s.az * RAD, R = 1200;
      M.sun.position.set(T.x + Math.sin(a) * Math.cos(e) * R, Math.sin(e) * R, T.z - Math.cos(a) * Math.cos(e) * R);
      M.sun.intensity = (M.look && M.look.sun || orig.intensity) * Math.min(1, 0.35 + Math.sin(e) * 1.2);
    } else {
      M.sun.position.set(T.x, 1200, T.z + 1);
      M.sun.intensity = orig.intensity * 0.15;
    }
    M.sun.target.position.copy(T); M.sun.target.updateMatrixWorld();
  }
  function restoreSun() { M.sun.position.copy(orig.pos); M.sun.target.position.copy(orig.target); M.sun.intensity = orig.intensity; M.sun.target.updateMatrixWorld(); }

  // ---------- 畫路線 ----------
  const layer = new THREE.Group(); M.scene.add(layer);
  const matShade = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.95 });
  const matSun = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.95 });
  const matAlt = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
  const mkPin = (txt, bg) => { const el = document.createElement('div'); el.className = 'sr-pin'; el.textContent = txt; el.style.background = bg; const o = M.addOverlay(el, new THREE.Vector3(), 200); M.setOverlay(o, false); return o; };
  const pinFrom = mkPin('起', '#16a34a'), pinTo = mkPin('終', '#dc2626');
  function clearLayer() { while (layer.children.length) { const c = layer.children.pop(); c.geometry.dispose(); } }
  const yAt = (x, z) => M.heightAt(x, z) + 1.6;
  function tube(points, mat, r) {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0);
    layer.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(4, points.length * 3), r, 6, false), mat));
  }
  function drawRoute(r, from, to, main) {
    if (!r) return;
    const runs = []; let cur = null;
    r.edges.forEach((k, i) => {
      const u = r.nodes[i], v = r.nodes[i + 1], sh = main ? SHADE[k] >= 0.5 : null;
      if (!cur || cur.sh !== sh) { cur = { sh, pts: cur ? [cur.pts[cur.pts.length - 1]] : [new THREE.Vector3(from.x, yAt(from.x, from.z), from.z), new THREE.Vector3(NX[u], yAt(NX[u], NZ[u]), NZ[u])] }; runs.push(cur); }
      cur.pts.push(new THREE.Vector3(NX[v], yAt(NX[v], NZ[v]), NZ[v]));
    });
    if (cur) cur.pts.push(new THREE.Vector3(to.x, yAt(to.x, to.z), to.z));
    runs.forEach(run => tube(run.pts, main ? (run.sh ? matShade : matSun) : matAlt, main ? 1.7 : 0.9));
  }
  function placePin(o, p) { if (!p) { M.setOverlay(o, false); return; } o.p.set(p.x, yAt(p.x, p.z) + 8, p.z); M.setOverlay(o, false); M.setOverlay(o, true); }

  // ---------- 更新 ----------
  let last = null, flown = '', stepsAt = [];
  function update(fly) {
    drawSky(); applySun();
    computeShade(sunNow());
    clearLayer();
    const from = pointOf(st.from), to = pointOf(st.to);
    placePin(pinFrom, from); placePin(pinTo, to);
    if (!from || !to || from.key === to.key) {
      $('#srMini').textContent = '尚未選擇終點（按「—」展開）';
      $('#srRes').innerHTML = `<div class="sr-note" style="margin:0">${!to ? '選擇終點（或直接點 3D 裡的館舍），就會畫出最短與陰涼兩條路線。拖曳上面的太陽可以改變時間。' : '起點和終點是同一個地方。'}</div>`;
      return;
    }
    const a = route(from, to, false), b = route(from, to, true);
    if (!a || !b) { $('#srRes').innerHTML = '<div class="sr-note">找不到步行路線。</div>'; return; }
    const same = a.edges.length === b.edges.length && a.edges.every((k, i) => k === b.edges[i]);
    const main = st.mode === 'shade' ? b : a, alt = st.mode === 'shade' ? a : b;
    if (!same) drawRoute(alt, from, to, false);
    drawRoute(main, from, to, true);
    const pct = x => Math.round(x * 100);
    const opt = (key, icon, title, r, extra) => `<div class="sr-opt ${st.mode === key ? 'on' : ''}" data-mode="${key}"><span style="font-size:18px">${icon}</span>
      <span class="t">${title}：約 ${r.min} 分鐘・${Math.round(r.len)} 公尺・遮蔭 ${pct(r.shade)}%</span>
      <span class="d">${extra}</span><div class="sr-bar"><i style="width:${pct(r.shade)}%"></i></div></div>`;
    const diff = Math.round(b.len - a.len);
    $('#srRes').innerHTML = night ? opt('shortest', '🚶', '最短路線', a, '太陽已下山，不用避開日曬') :
      opt('shortest', '🚶', '最短路線', a, '距離最短') +
      opt('shade', '🌳', '陰涼路線', b, same ? '最短路線剛好就是最陰涼的'
        : `${diff > 5 ? `多走 ${diff} 公尺` : '距離差不多'}，遮蔭${pct(b.shade) >= pct(a.shade) ? '多' : '少'} ${Math.abs(pct(b.shade) - pct(a.shade))}%`);
    // 路線說明（目前選的那條）
    const info = describe(main, from, to);
    const tag = sh => sh == null ? '' : sh >= 0.6 ? '<span class="sr-tag y">🌳 有遮蔭</span>' : sh <= 0.3 ? '<span class="sr-tag n">☀️ 曬太陽</span>' : '<span class="sr-tag m">⛅ 部分遮蔭</span>';
    const day = dayKey();
    const evMarks = info.marks.filter(m => m.place).map(m => ({ m, n: eventsOnDay(m.place, day).length })).filter(x => x.n);
    const plain = info.marks.filter(m => !evMarks.some(x => x.m === m));
    $('#srRes').insertAdjacentHTML('beforeend', `
      <div class="sr-sec"><h5>🧭 ${st.mode === 'shade' ? '陰涼路線' : '最短路線'}怎麼走${main.climb >= 5 ? `（有上坡，爬升約 ${Math.round(main.climb)} 公尺，時間已加計）` : ''}</h5>
        <ol class="sr-steps">${info.steps.map((p, i) => `<li data-step="${i}"><span>${p.icon}</span><div>${p.html}</div>${night ? '' : tag(p.sh)}</li>`).join('')}</ol></div>
      ${evMarks.length ? `<div class="sr-sec"><h5>⭐ 順路活動（${day}）：點一下改走到這館</h5><div class="sr-chips">${evMarks.map(x => `<span class="sr-chip ev" data-go="${esc(x.m.place.name)}">${esc(disp(x.m.name))} · ${x.n} 項</span>`).join('')}</div></div>` : ''}
      ${plain.length ? `<div class="sr-sec"><h5>🏢 沿路會看到</h5><div class="sr-chips">${plain.map(m => `<span class="sr-chip">${esc(disp(m.name))}</span>`).join('')}</div></div>` : ''}`);
    stepsAt = info.steps.map(p => p.at);
    last = { a, b };
    $('#srMini').innerHTML = `<b>${String(Math.floor(st.min / 60)).padStart(2, '0')}:${String(st.min % 60).padStart(2, '0')}</b>　${esc(from.name)} → ${esc(to.name)}　${st.mode === 'shade' ? '🌳' : '🚶'} 約 ${main.min} 分鐘・遮蔭 ${pct(main.shade)}%`;
    const key = from.key + '>' + to.key;
    if (fly || flown !== key) {
      flown = key;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      main.nodes.forEach(n => { x0 = Math.min(x0, NX[n]); x1 = Math.max(x1, NX[n]); z0 = Math.min(z0, NZ[n]); z1 = Math.max(z1, NZ[n]); });
      M.flyToPoint((x0 + x1) / 2, (z0 + z1) / 2, Math.max(260, Math.hypot(x1 - x0, z1 - z0) * 1.3));
    }
  }
  // 合併同一畫格內的多次更新；分頁在背景時 requestAnimationFrame 會暫停，所以另外用計時器保底
  let pending = null;
  const schedule = fly => {
    if (pending) { pending.fly = pending.fly || fly; return; }
    pending = { fly };
    const run = () => { if (!pending) return; const f = pending.fly; pending = null; update(f); };
    requestAnimationFrame(run); setTimeout(run, 60);
  };
  function setTime(m) { st.min = m; schedule(false); }

  // 播放一天：從現在的時間往後，每一格 10 分鐘
  let playing = null;
  function stopPlay() { if (playing) { clearInterval(playing); playing = null; drawSky(); } }
  function togglePlay() {
    if (playing) { stopPlay(); return; }
    if (st.min >= T1 - 10) st.min = 6 * 60;
    playing = setInterval(() => { if (st.min >= 18 * 60 + 30) { stopPlay(); return; } st.min += 10; update(false); }, 280);
    drawSky();
  }

  // ---------- 事件 ----------
  $('#srFrom').onchange = e => { st.from = e.target.value; schedule(true); };
  $('#srTo').onchange = e => { st.to = e.target.value; schedule(true); };
  $('#srSwap').onclick = () => { if (!st.to) return; [st.from, st.to] = [st.to, st.from]; fillSelects(); schedule(true); };
  $('#srRes').addEventListener('click', e => {
    const o = e.target.closest('[data-mode]'); if (o) { st.mode = o.dataset.mode; schedule(false); return; }
    const go = e.target.closest('[data-go]'); if (go) { st.to = 'loc:' + go.dataset.go; $('#srTo').value = st.to; schedule(true); return; }
    const li = e.target.closest('[data-step]'); if (li && stepsAt[+li.dataset.step]) { const [x, z] = stepsAt[+li.dataset.step]; M.flyToPoint(x, z, 160); }
  });
  $('#srDays').addEventListener('click', e => {
    const b = e.target.closest('button[data-d]'); if (!b) return;
    st.date = b.dataset.d === 'today' ? new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) : b.dataset.d;
    $('#srDate').value = st.date;
    panel.querySelectorAll('#srDays button').forEach(x => x.classList.toggle('on', x === b));
    fillSelects(); schedule(false);
  });
  $('#srDate').onchange = e => { if (!e.target.value) return; st.date = e.target.value; panel.querySelectorAll('#srDays button').forEach(x => x.classList.toggle('on', x.dataset.d === st.date)); fillSelects(); schedule(false); };
  // 面板開著時點 3D 館舍 → 設為終點
  window.addEventListener('map3d:select', ev => {
    const loc = ev.detail;
    if (!panel.classList.contains('open') || !loc || loc.south || loc.remote) return;
    st.to = 'loc:' + loc.name; $('#srTo').value = st.to; schedule(true);
  });
  // ---------- 拖曳移動、縮小（位置記在這台電腦）----------
  const POS_KEY = 'map3d-shade-panel-v2';
  const saveUi = () => { try { localStorage.setItem(POS_KEY, JSON.stringify({ left: panel.style.left, top: panel.style.top, min: panel.classList.contains('min') })); } catch (e) { /* 無 */ } };
  function clampPos() {
    if (!panel.style.left) return;
    const w = panel.offsetWidth, h = panel.querySelector('.sr-head').offsetHeight + 20;
    panel.style.left = Math.min(window.innerWidth - Math.min(w, 120), Math.max(8 - w + 120, parseFloat(panel.style.left))) + 'px';
    panel.style.top = Math.min(window.innerHeight - h, Math.max(60, parseFloat(panel.style.top))) + 'px';
  }
  try {
    const u = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
    if (u.left && u.top) { panel.style.left = u.left; panel.style.top = u.top; panel.style.right = 'auto'; panel.classList.add('moved'); }
    if (u.min) panel.classList.add('min');
  } catch (e) { /* 無 */ }
  function syncBody() {
    const open = panel.classList.contains('open');
    document.body.classList.toggle('sr-open', open);
    document.body.classList.toggle('sr-docked', open && !panel.classList.contains('moved') && !panel.classList.contains('min'));
  }
  const head = panel.querySelector('.sr-head');
  let drag = null;
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || window.innerWidth <= 700) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { head.setPointerCapture(e.pointerId); } catch (err) { /* 無 */ }
  });
  head.addEventListener('pointermove', e => {
    if (!drag) return;
    panel.style.right = 'auto'; panel.classList.add('moved');
    panel.style.left = (e.clientX - drag.dx) + 'px';
    panel.style.top = (e.clientY - drag.dy) + 'px';
    clampPos();
  });
  head.addEventListener('pointerup', () => { if (drag) { drag = null; saveUi(); syncBody(); } });
  head.addEventListener('dblclick', e => { if (!e.target.closest('button')) { panel.style.left = ''; panel.style.right = ''; panel.classList.remove('moved'); dock(); saveUi(); syncBody(); } });   // 雙擊標題回到活動清單的位置
  window.addEventListener('resize', clampPos);
  $('.min').onclick = () => { panel.classList.toggle('min'); $('.min').textContent = panel.classList.contains('min') ? '▢' : '—'; saveUi(); syncBody(); };
  if (panel.classList.contains('min')) $('.min').textContent = '▢';

  // 開啟時把「活動總覽」（左）和「活動清單」（右）都收起來，關閉時恢復成原本的樣子
  const folded = [];
  function makeRoom(on) {
    if (on) {
      ['.panel-left', '.panel-right'].forEach(sel => {
        const el = document.querySelector(sel), b = el && el.querySelector('.collapse-btn');
        if (b && !el.classList.contains('collapsed')) { b.click(); folded.push(sel); }
      });
    } else {
      while (folded.length) {
        const el = document.querySelector(folded.pop()), b = el && el.querySelector('.collapse-btn');
        if (b && el.classList.contains('collapsed')) b.click();
      }
    }
  }
  // 停靠在活動清單的位置：上緣接在收合後的清單標籤下方
  function dock() {
    if (panel.classList.contains('moved')) return;
    const right = document.querySelector('.panel-right');
    const top = right ? right.getBoundingClientRect().bottom + 8 : 72;
    panel.style.top = Math.max(72, Math.round(top)) + 'px';
  }
  window.addEventListener('resize', () => { if (panel.classList.contains('open')) dock(); });

  function open() {
    fillSelects(); makeRoom(true); panel.classList.add('open'); btn.classList.add('on'); syncBody();
    dock(); requestAnimationFrame(dock); setTimeout(dock, 350);      // 等兩側面板收合的動畫結束再對齊一次
    if (window.MAP3D_THEME !== 'day' && !$('#srNight')) {
      $('#srRes').insertAdjacentHTML('beforebegin', '<div class="sr-note" id="srNight" style="color:var(--gold,#ffd36e)">🌙 目前是夜景模式，看不到陽光照出的影子；<a href="?theme=day" style="color:inherit">切換到白天</a>可以看到建築影子隨時間移動（路線計算不受影響）。</div>');
    }
    update(true);
    if (typeof gtag === 'function') gtag('event', 'map3d_shade_route_open');
  }
  function close() {
    stopPlay(); panel.classList.remove('open'); btn.classList.remove('on');
    clearLayer(); M.setOverlay(pinFrom, false); M.setOverlay(pinTo, false); restoreSun();
    makeRoom(false); syncBody();
  }
  btn.onclick = () => (panel.classList.contains('open') ? close() : open());
  $('.x').onclick = close;

  M.shadeRoute = { open, close, sunAt, route, state: st, get last() { return last; } };
})();
