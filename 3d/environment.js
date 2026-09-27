// ============================================================
// 院區環境（微縮模型風）：道路、溪流、停車場與停車格、水池、運動場、樹、夜間路燈
// 資料：data/environment.js（window.CAMPUS_ENV，由 tools/build_data.py 產生）
// 顏色：theme.js 的 env 區塊
// ============================================================
(function () {
  const M = window.MAP3D, E = window.CAMPUS_ENV, C = window.MAP3D_CONFIG, V = C.env, LK = C.look;
  const scene = M.scene, shadows = M.useShadows;
  const hex = c => '#' + new THREE.Color(c).getHexString();

  // ---------- 程式產生的路面貼圖 ----------
  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  function grain(ctx, w, h, base, amt) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.25; i++) {
      const v = (Math.random() - 0.5) * amt;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }
  const texMain = canvasTex(128, 256, (c, w, h) => {            // 主要道路：白色邊線＋黃色虛線中線
    grain(c, w, h, hex(V.asphalt), 0.12);
    c.fillStyle = hex(V.line); c.fillRect(6, 0, 3, h); c.fillRect(w - 9, 0, 3, h);
    c.fillStyle = hex(V.center); c.fillRect(w / 2 - 2, 0, 4, h * 0.55);
  });
  const texRoad = canvasTex(64, 128, (c, w, h) => {             // 院內車道：細白邊線
    grain(c, w, h, hex(V.asphalt), 0.12);
    c.fillStyle = hex(V.line); c.globalAlpha = 0.8; c.fillRect(3, 0, 2, h); c.fillRect(w - 5, 0, 2, h);
  });
  const texFoot = canvasTex(32, 64, (c, w, h) => {              // 步道：地磚
    grain(c, w, h, hex(V.paver), 0.18);
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
    for (let y = 0; y < h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 8); c.stroke(); }
  });

  // ---------- 帶狀路面 ----------
  function ribbon(list, tileLen) {
    const pos = [], uv = [];
    list.forEach(r => {
      const p = r.p, half = r.w / 2;
      let dist = 0; const L = [], R = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        if (i > 0) dist += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        L.push([p[i][0] - dz * half, p[i][2], p[i][1] + dx * half, 0, dist / tileLen]);
        R.push([p[i][0] + dz * half, p[i][2], p[i][1] - dx * half, 1, dist / tileLen]);
      }
      for (let i = 0; i < p.length - 1; i++)
        [L[i], R[i], R[i + 1], L[i], R[i + 1], L[i + 1]].forEach(v => { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  function surfaceMat(opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.3 }, opts));
  }
  function addSurface(geo, mat) {
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadows; scene.add(m); return m;
  }
  // 院外只保留主要幹道（研究院路、高速公路）；院內全部保留
  const keep = r => r.w >= 8 || r.p.some(([x, z]) => M.inCampus(x, z));
  const roads = E.roads.filter(keep);
  const SOUTH = window.CAMPUS_SOUTH, SO = M.SOUTH_OFF;
  if (SOUTH) SOUTH.roads.forEach(r => roads.push({ w: r.w, f: r.f, p: r.p.map(([x, z, y]) => [x + SO[0], z + SO[1], y]) }));
  const foot = roads.filter(r => r.f), main = roads.filter(r => !r.f && r.w >= 8), road = roads.filter(r => !r.f && r.w < 8);
  addSurface(ribbon(foot, 6), surfaceMat({ map: texFoot }));
  addSurface(ribbon(road, 14), surfaceMat({ map: texRoad }));
  addSurface(ribbon(main, 16), surfaceMat({ map: texMain }));
  addSurface(ribbon(E.streams, 20), surfaceMat({ color: V.water, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.0 }));

  // ---------- 平面區塊（停車場、水池、運動場）----------
  function flat(polys, y, mat) {
    if (!polys.length) return;
    const g = new THREE.ShapeGeometry(polys.map(p => new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)))));
    g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
    addSurface(g, mat);
  }
  flat(E.parking, 0.2, surfaceMat({ map: canvasTex(64, 64, (c, w, h) => grain(c, w, h, hex(V.parking), 0.14)) }));
  flat(E.water, 0.15, surfaceMat({ color: V.water, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.2 }));
  flat(E.pitches, 0.15, surfaceMat({ color: V.pitch, roughness: 0.9 }));

  const sp = [];
  E.stallLines.forEach(l => { for (let i = 0; i < l.length - 1; i++) sp.push(l[i][0], 0.35, l[i][1], l[i + 1][0], 0.35, l[i + 1][1]); });
  E.pitches.forEach(p => p.forEach((v, i) => { const w = p[(i + 1) % p.length]; sp.push(v[0], 0.3, v[1], w[0], 0.3, w[1]); }));
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: V.stall, transparent: true, opacity: 0.7 })));

  // ---------- 手動補充水池（custom_features.js）----------
  const PONDS = (window.CUSTOM_FEATURES && window.CUSTOM_FEATURES.ponds) || [];
  function inPond(x, z, k) {
    return PONDS.some(p => {
      const dx = x - p.x, dz = z - p.z, c = Math.cos(-p.rot), s2 = Math.sin(-p.rot);
      const u = (dx * c - dz * s2) / (p.rx * k), v = (dx * s2 + dz * c) / (p.rz * k);
      return u * u + v * v < 1;
    });
  }
  PONDS.forEach(P => {
    const N = 40, rnd = k => { const x = Math.sin(P.seed * 17.3 + k * 7.1) * 43758.5; return x - Math.floor(x); };
    const edge = (t, k) => {                                     // 不規則岸線上的點（t: 0~1，k: 半徑倍率）
      const a = t * Math.PI * 2, w = 1 + 0.12 * Math.sin(a * 3 + P.seed) + 0.07 * Math.sin(a * 5 + P.seed * 2);
      const u = Math.cos(a) * P.rx * w * k, v = Math.sin(a) * P.rz * w * k, c = Math.cos(P.rot), s2 = Math.sin(P.rot);
      return [P.x + u * c - v * s2, P.z + u * s2 + v * c];
    };
    const ring = k => Array.from({ length: N }, (_, i) => edge(i / N, k));
    flat([ring(1.12)], 0.12, surfaceMat({ color: V.pondBank, roughness: 1 }));                     // 泥岸
    flat([ring(1.0)], 0.22, surfaceMat({ color: V.pond, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.3 }));
    // 岸邊水生植物（細長葉叢）
    const reed = new THREE.ConeGeometry(0.35, 1, 5).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(reed, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), P.reeds);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < P.reeds; i++) {
      const [x, z] = edge(rnd(i), 0.9 + rnd(i + 99) * 0.22), h = 1.2 + rnd(i + 7) * 1.6;
      m4.compose(ps.set(x, 0.2, z), q.setFromAxisAngle(new THREE.Vector3(rnd(i + 3) - 0.5, 0, rnd(i + 5) - 0.5).normalize(), (rnd(i + 11) - 0.5) * 0.4), sc.set(1, h, 1));
      im.setMatrixAt(i, m4); im.setColorAt(i, c.set(V.reed).offsetHSL((rnd(i) - 0.5) * 0.05, 0, (rnd(i + 1) - 0.5) * 0.12));
    }
    im.castShadow = im.receiveShadow = shadows; scene.add(im);
    // 水面浮葉
    const pad = new THREE.CircleGeometry(0.9, 10).rotateX(-Math.PI / 2);
    const lm = new THREE.InstancedMesh(pad, new THREE.MeshStandardMaterial({ color: V.lily, roughness: 0.6 }), P.lilies);
    for (let i = 0; i < P.lilies; i++) {
      const [x, z] = edge(rnd(i + 200), 0.25 + rnd(i + 300) * 0.6), k = 0.6 + rnd(i + 400) * 0.8;
      m4.compose(ps.set(x, 0.28, z), q.identity(), sc.set(k, 1, k)); lm.setMatrixAt(i, m4);
    }
    lm.receiveShadow = shadows; scene.add(lm);
    // 木棧道（沿岸線外側）
    if (P.boardwalk) {
      const [t0, t1] = P.boardwalk, steps = 30, deck = [], rail = [];
      for (let i = 0; i <= steps; i++) {
        const t = t0 + (t1 - t0) * i / steps;
        const [ix, iz] = edge(t, 1.08), [ox, oz] = edge(t, 1.2);
        deck.push([ix, iz, ox, oz]);
        rail.push(ox, 1.4, oz);
      }
      const pos = [];
      for (let i = 0; i < steps; i++) {
        const [a1, b1, a2, b2] = deck[i], [c1, d1, c2, d2] = deck[i + 1], y = 0.6;
        pos.push(a1, y, b1, a2, y, b2, c2, y, d2, a1, y, b1, c2, y, d2, c1, y, d1);
      }
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.computeVertexNormals();
      const dm = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: V.deck, roughness: 0.8, side: THREE.DoubleSide }));
      dm.castShadow = dm.receiveShadow = shadows; scene.add(dm);
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rail, 3));
      scene.add(new THREE.Line(rg, new THREE.LineBasicMaterial({ color: V.deck })));
    }
  });

  // ---------- 樹：多團樹冠（闊葉林，台灣低海拔山區）----------
  if (V.trees) {
    // 樹量：院區附近 / 後山分開控制；內建顯示卡用 lowGpu 設定；之後自動降級可再用 MAP3D.setTreeDensity 減少
    const Tr = E.trees.slice(), G = M.lowGpu ? V.lowGpu : V;
    if (SOUTH) {                                   // 南部院區：院內空地與周邊撒樹（避開建築）
      const pip = (x, y, p) => { let o = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; } return o; };
      for (let x = -250; x < 450; x += 16) for (let y = -280; y < 360; y += 16) {
        const jx = x + (Math.sin(x * 7.1 + y) * 5), jy = y + (Math.cos(y * 3.7 + x) * 5), inC = pip(jx, jy, SOUTH.campus);
        const r = Math.abs(Math.sin(jx * 12.9 + jy * 78.2) * 43758.5) % 1;
        if (SOUTH.buildings.some(b => pip(jx, jy, b.p)) || r > (inC ? 0.45 : 0.18)) continue;
        Tr.push(Math.round(jx + SO[0]), Math.round(jy + SO[1]), 0, Math.round(80 + r * 60), 0);
      }
    }
    const keep = (i, d) => (Math.abs(Math.sin(Tr[i] * 3.17 + Tr[i + 1] * 7.93) * 9301.7) % 1) < d;   // 固定亂數抽樣，分布均勻
    const U = THREE.BufferGeometryUtils;
    function canopy(seed, blobs, trunk, smooth) {                // 球狀樹冠 + 樹幹；smooth = 圓滑（院區）
      const rnd = (k) => { const x = Math.sin(seed * 91.7 + k * 13.3) * 43758.5; return x - Math.floor(x); };
      const parts = [];
      if (trunk) { const t = new THREE.CylinderGeometry(0.25, 0.4, 3.0, 6).translate(0, 1.5, 0); t.deleteAttribute('uv'); parts.push(smooth ? t : t.toNonIndexed()); }
      blobs.forEach(([x, y, z, r], k) => {
        let g = new THREE.IcosahedronGeometry(r * (0.9 + 0.2 * rnd(k)), smooth ? 1 : 0);
        g.deleteAttribute('uv'); g.deleteAttribute('normal');
        if (smooth) g = U.mergeVertices(g);                       // 共用頂點 → 擾動不裂開、法線平滑
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const j = 1 + (rnd(i + k * 50) - 0.5) * (smooth ? 0.18 : 0.3); p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.85, p.getZ(i) * j); }
        g.computeVertexNormals();
        g.translate(x, y, z); parts.push(g);
      });
      if (!smooth) parts.forEach((g, i) => { if (g.index) parts[i] = g.toNonIndexed(); });
      parts.forEach(g => g.deleteAttribute('normal'));
      const g = U.mergeBufferGeometries(parts);
      g.computeVertexNormals();
      return g;
    }
    // 院區樹：1 團圓滑樹冠（icosahedron detail 1）＋樹幹、投影子；後山樹：單團低面數、不投影子（遠看只需要輪廓）
    const geos = [canopy(1, [[0, 4.3, 0, 2.9]], true, true), canopy(2, [[0.2, 4.1, -0.1, 2.8]], true, true),
                  canopy(3, [[0, 4.0, 0, 3.0]], false, false)];
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, envMapIntensity: 0.25 });
    const palette = V.treeColors.map(c => new THREE.Color(c));
    const buckets = [[], [], []], treeMeshes = [];
    for (let i = 0; i < Tr.length; i += 5) { if (keep(i, Tr[i + 4] === 1 ? G.mountainTreeDensity : G.treeDensity) && !inPond(Tr[i], Tr[i + 1], 1.25)) buckets[Tr[i + 4] === 1 ? 2 : ((Tr[i] * 7 + Tr[i + 1] * 3) & 0x7fffffff) % 2].push(i); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    buckets.forEach(idx => idx.sort((p, q) => (Math.sin(Tr[p] * 1.7 + Tr[p + 1]) * 1e4 % 1) - (Math.sin(Tr[q] * 1.7 + Tr[q + 1]) * 1e4 % 1)));
    buckets.forEach((idx, b) => {
      if (!idx.length) return;
      const im = new THREE.InstancedMesh(geos[b], mat, idx.length);
      idx.forEach((i, n) => {
        const mountain = Tr[i + 4] === 1, k = Tr[i + 3] / 100 * (mountain ? V.treeScaleMountain : V.treeScale);
        const hsh = Math.abs(Math.sin(Tr[i] * 12.9898 + Tr[i + 1] * 78.233) * 43758.5453) % 1;
        q.setFromAxisAngle(up, hsh * 6.283);
        m4.compose(p.set(Tr[i], Tr[i + 2] - 0.2, Tr[i + 1]), q, s.set(k, k * (0.85 + hsh * 0.35), k));
        im.setMatrixAt(n, m4);
        c.copy(palette[Math.floor(hsh * palette.length)]);
        if (mountain) c.multiplyScalar(0.82);
        im.setColorAt(n, c.offsetHSL((hsh - 0.5) * 0.03, 0, (hsh - 0.5) * 0.06));
      });
      im.castShadow = shadows && b < 2 && (!M.lowGpu || V.lowGpu.treeShadows); im.receiveShadow = shadows;
      im.userData.full = idx.length;
      scene.add(im); treeMeshes.push(im);
    });
    // 自動降級用：排列已打散，減少 count 就是均勻減量
    M.setTreeDensity = k => treeMeshes.forEach(m => { m.count = Math.floor(m.userData.full * k); });
  }

  // ---------- 夜間路燈（暖色光點，搭配光暈）----------
  if (LK.streetLights) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,160,0.8)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const pts = [];
    roads.filter(r => !r.f && r.w >= 4.5).forEach(r => {
      let acc = 0, side = 1;
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az, ay] = r.p[i - 1], [bx, bz] = r.p[i], seg = Math.hypot(bx - ax, bz - az);
        acc += seg;
        if (acc > 30) {
          acc = 0; side = -side;
          const dx = (bx - ax) / (seg || 1), dz = (bz - az) / (seg || 1), off = r.w / 2 + 1.2;
          pts.push(bx - dz * off * side, ay + 6, bz + dx * off * side);
        }
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      map: tex, color: new THREE.Color(LK.streetLightColor).multiplyScalar(3), size: 14, sizeAttenuation: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    })));
  }
})();
