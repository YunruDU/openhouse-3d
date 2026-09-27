// ============================================================
// 中研院 3D 地圖 — Three.js 主程式（r147 classic build，可用 file:// 開啟）
// 風格：精緻微縮模型（PBR 材質、陰影、環境反射、景深模糊、電影色調）
// 對外介面：window.MAP3D（給 hud.js / environment.js 使用）
//   scene, lowPower, locations, campusLocs, events
//   select(loc|null) 選取並飛過去、home() 回全景、setFilter(fn|null)、setViewShift(f)、isMobile()
//   事件：window 'map3d:select'（detail = loc 或 null）、'map3d:ready'
// ============================================================
(function () {
  const C = window.MAP3D_CONFIG, LK = C.look;
  const B = window.CAMPUS_BUILDINGS.buildings;
  const DATA = window.CAMPUS_EVENTS;
  const S = window.BUILDING_STYLES;
  const container = document.getElementById('scene');

  const isMobile = () => window.innerWidth < C.perf.mobileBreakpoint;
  const lowPower = isMobile() || matchMedia('(pointer: coarse)').matches;
  const usePost = !lowPower;                       // 桌機：景深 + 光暈 + 色調後製
  const useShadows = LK.shadows && !lowPower;
  // 內建顯示卡偵測（Intel / AMD 內顯 / 軟體繪圖）：一開始就用輕量設定，不等掉幀才降級
  const gpuName = (() => { try { const gl = document.createElement('canvas').getContext('webgl'), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } })();
  const lowGpu = lowPower || /Intel|UHD|Iris|HD Graphics|Radeon\(TM\) Graphics|Radeon Vega|Vega \d+ Graphics|SwiftShader|llvmpipe|Mali|Adreno|PowerVR/i.test(gpuName);
  if (lowGpu) console.info('[3D] 內建顯示卡模式：', gpuName);

  THREE.ColorManagement.legacyMode = false;        // 色碼視為 sRGB，正確線性光照

  // ---------- 渲染器 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? C.perf.mobilePixelRatio : C.perf.desktopPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = useShadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (usePost) {                                   // 後製最後一道自己做色調映射與 gamma
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
  } else {
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LK.exposure;
  }
  container.appendChild(renderer.domElement);

  // 標籤層（取代 CSS2DRenderer）：只在鏡頭移動時更新位置、取整數像素、畫面外隱藏 → 內建顯示卡 FPS 約翻倍
  const labelLayer = document.createElement('div');
  labelLayer.className = 'label-layer';
  container.appendChild(labelLayer);
  const overlays = [], _ov = new THREE.Vector3();
  let overlaysDirty = true;
  function addOverlay(el, pos, z) {
    el.classList.add('ov');
    if (z != null) el.style.zIndex = z;
    labelLayer.appendChild(el);
    const o = { el, p: pos, on: true, shown: true, x: NaN, y: NaN };
    overlays.push(o); overlaysDirty = true;
    return o;
  }
  function setOverlay(o, on) { if (o.on !== on) { o.on = on; overlaysDirty = true; } }
  function renderOverlays() {
    const w = container.clientWidth, h = container.clientHeight;
    overlays.forEach(o => {
      let vis = o.on;
      if (vis) { _ov.copy(o.p).project(camera); vis = _ov.z < 1 && Math.abs(_ov.x) < 1.15 && Math.abs(_ov.y) < 1.15; }
      if (vis !== o.shown) { o.el.style.display = vis ? '' : 'none'; o.shown = vis; }
      if (!vis) return;
      const x = Math.round((_ov.x + 1) / 2 * w), y = Math.round((1 - _ov.y) / 2 * h);
      if (x !== o.x || y !== o.y) { o.x = x; o.y = y; o.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; }
    });
    overlaysDirty = false;
  }

  // ---------- 場景、天空、霧、環境反射 ----------
  const scene = new THREE.Scene();
  (function sky() {
    const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
    const cx = cv.getContext('2d'), gr = cx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, LK.skyTop); gr.addColorStop(1, LK.skyBottom);
    cx.fillStyle = gr; cx.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    scene.background = t;
  })();
  scene.fog = new THREE.Fog(LK.fog, LK.fogNear, LK.fogFar);
  if (THREE.RoomEnvironment) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  }

  // ---------- 相機與操控 ----------
  const camera = new THREE.PerspectiveCamera(C.camera.fov, container.clientWidth / container.clientHeight, 8, 12000);
  camera.position.fromArray(C.camera.position);
  function fitPortrait() {                         // 直式螢幕視野窄：放大 FOV、拉遠
    const a = container.clientWidth / container.clientHeight;
    camera.fov = a < 1 ? C.camera.fov * 1.35 : C.camera.fov;
    return a < 1 ? Math.pow(1 / a, 0.55) : 1;
  }
  const portraitScale = fitPortrait();
  const T0 = new THREE.Vector3().fromArray(C.camera.target);
  camera.position.sub(T0).multiplyScalar(portraitScale).add(T0);

  const controls = new THREE.OrbitControls(camera, labelLayer);
  controls.target.copy(T0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = C.camera.minDistance;
  controls.maxDistance = C.camera.maxDistance * portraitScale;
  controls.minPolarAngle = C.camera.minPolar;
  controls.maxPolarAngle = C.camera.maxPolar;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = C.camera.autoRotateSpeed;
  controls.update();
  const HOME = { pos: camera.position.clone(), target: controls.target.clone() };

  // ---------- 光線與陰影 ----------
  scene.add(new THREE.HemisphereLight(LK.hemiSky, LK.hemiGround, LK.hemiIntensity));
  const sun = new THREE.DirectionalLight(LK.sunColor, LK.sun);
  const SC = new THREE.Vector3(-70, 0, -150);      // 院區中心（陰影範圍中心）
  sun.position.set(SC.x + LK.sunPos[0], LK.sunPos[1], SC.z + LK.sunPos[2]);
  sun.target.position.copy(SC);
  if (useShadows) {
    sun.castShadow = true;
    const sm = lowGpu ? C.env.lowGpu.shadowMap : (C.perf.shadowMap || 2048);
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -720; sc.right = 720; sc.top = 720; sc.bottom = -720; sc.near = 100; sc.far = 3000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.8;
    sun.shadow.radius = 3;
  }
  scene.add(sun, sun.target);

  // ---------- 地形（真實高程，依高度與坡度上色）----------
  const T = window.CAMPUS_TERRAIN;
  function inPoly(x, z, r) {
    let o = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) o = !o;
    }
    return o;
  }
  const inCampus = (x, z) => T.campus.some(r => inPoly(x, z, r));
  function heightAt(x, z) {                        // 地形高度（雙線性內插；南港地形範圍外 = 0）
    if (Math.abs(x) > T.half || Math.abs(z) > T.half) return 0;
    const fx = (x + T.half) / T.step, fz = (z + T.half) / T.step;
    const i = Math.max(0, Math.min(T.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.n - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j)), h = (a, b) => T.h[b * T.n + a];
    return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
  }
  (function terrain() {
    const g = new THREE.PlaneGeometry(T.half * 2, T.half * 2, T.n - 1, T.n - 1);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, T.h[i]);
    g.computeVertexNormals();
    const G = LK.ground, cGrass = new THREE.Color(G.grass), cForest = new THREE.Color(G.forest),
      cRock = new THREE.Color(G.rock), cFlat = new THREE.Color(G.flat), cOut = new THREE.Color(G.outside || G.forest), n = g.attributes.normal;
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), slope = 1 - n.getY(i);
      const noise = Math.sin(x * 0.05) * Math.cos(z * 0.045) * 0.5 + Math.sin((x + z) * 0.013) * 0.5;
      if (y < 0.5 && inCampus(x, z)) c.copy(cFlat).lerp(cGrass, 0.5 + 0.5 * noise);
      else if (y < 0.5) c.copy(cOut).lerp(cForest, 0.4 + 0.4 * noise);                 // 院外平地：林地
      else c.copy(cGrass).lerp(cForest, Math.min(1, y / 25 + 0.3 + 0.2 * noise)).lerp(cRock, Math.max(0, slope - 0.35) * 1.4);
      const edge = Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - T.half * 0.75) / (T.half * 0.25));
      c.lerp(new THREE.Color(LK.fog), edge);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.2 }));
    m.receiveShadow = useShadows;
    scene.add(m);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 48), new THREE.MeshBasicMaterial({ color: LK.fog }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1;
    scene.add(ground);
  })();

  // ---------- 星空、101 ----------
  if (LK.stars) {
    const n = lowPower ? 500 : 1400, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.4, r = 9000;
      a.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, fog: false })));
  }
  (function tower() {                              // 台北 101（實際在西方約 5km，縮近擺放）
    const dir = new THREE.Vector2(-4990, 995).normalize().multiplyScalar(3400);
    const mat = LK.towerGlow
      ? new THREE.MeshBasicMaterial({ color: LK.tower, fog: false })
      : new THREE.MeshStandardMaterial({ color: LK.tower, roughness: 0.3, metalness: 0.4, fog: false });
    const g = new THREE.Group(); let y = 0;
    [[42, 90], [34, 60]].forEach(([w, h]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat); m.position.y = y + h / 2; g.add(m); y += h; });
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(22, 15, 32, 4), mat); m.position.y = y + 16; m.rotation.y = Math.PI / 4; g.add(m); y += 32; }
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 4, 70, 6), mat); sp.position.y = y + 35; g.add(sp);
    g.position.set(dir.x, 0, dir.y); g.scale.setScalar(0.7);
    scene.add(g);
  })();

  // ---------- 建築（PBR 材質 + 程式窗戶；外觀參數見 building_styles.js）----------
  const WIN_STYLE = { grid: 0, band: 1, glass: 2, slit: 3, none: 4 };
  const glassCol = new THREE.Color(LK.glass), curtainCol = new THREE.Color(LK.curtain), winCol = new THREE.Color(LK.windowColor);
  const hiCol = new THREE.Color(C.colors.highlight);

  function patchBuilding(shader, u) {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN;
        uniform vec3 uRoof; uniform vec3 uTrim; uniform vec3 uGlass; uniform vec3 uWin; uniform vec3 uHiColor;
        uniform float uStyle; uniform float uBrick; uniform float uFloorH; uniform float uLit; uniform float uTop;
        uniform float uHi; uniform float uDim; uniform float uLight;
        float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float bx(float v, float a, float b){ return step(a, v) * step(v, b); }
        float gWin = 0.0; float gOn = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 wall = diffuseColor.rgb * uLight;
          if (vWN.y > 0.5) {                                   // 屋頂：細微紋理
            diffuseColor.rgb = uRoof * uLight * (0.9 + 0.12 * bh(floor(vWP.xz / 2.0)));
            if (vWN.y < 0.97) diffuseColor.rgb *= 0.85 + 0.15 * step(0.3, fract(vWP.y * 2.2));
          } else {
            float u = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
            float fy = fract(vWP.y / uFloorH);
            vec2 cell = vec2(0.0);
            if (uStyle < 0.5)      { float fx = fract(u / 3.2); gWin = bx(fx, .2, .8) * bx(fy, .28, .82); cell = vec2(floor(u / 3.2), floor(vWP.y / uFloorH)); }
            else if (uStyle < 1.5) { gWin = bx(fy, .3, .82) * step(.05, fract(u / 1.6)); cell = vec2(floor(u / 6.4), floor(vWP.y / uFloorH)); }
            else if (uStyle < 2.5) { gWin = step(.04, fract(u / 1.5)) * step(.06, fy); cell = vec2(floor(u / 4.5), floor(vWP.y / uFloorH)); }
            else if (uStyle < 3.5) { float fx = fract(u / 2.4); gWin = bx(fx, .4, .6) * bx(fy, .14, .88); cell = vec2(floor(u / 2.4), floor(vWP.y / uFloorH)); }
            if (uBrick > 0.5) wall *= 0.92 + 0.08 * step(0.14, fract(vWP.y / 0.33)) * step(0.06, fract((u + step(0.5, fract(vWP.y / 0.66)) * 0.6) / 1.2));
            wall = mix(wall, uTrim * uLight, step(fy, 0.07) * step(3.0, vWP.y));          // 樓板腰帶
            wall = mix(wall, uTrim * uLight, step(uTop - 0.9, vWP.y));                       // 女兒牆壓頂
            gWin *= step(vWP.y, uTop - 1.0) * step(0.6, vWP.y);
            gOn = step(1.0 - uLit, bh(cell + floor(vWP.xz / 50.0)));
            float sill = gWin * (1.0 - step(0.02, fract(vWP.y / uFloorH) - 0.28)) ;             // 窗台陰影
            diffuseColor.rgb = mix(wall, uGlass * (0.8 + 0.4 * bh(cell)), gWin) * (1.0 - 0.25 * sill);
          }
          float ao = mix(0.55, 1.0, smoothstep(0.0, 7.0, vWP.y));                               // 牆腳自然變暗
          diffuseColor.rgb *= ao * (1.0 - 0.6 * uDim);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, gWin);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uWin * gWin * gOn * 2.2 + uHiColor * uHi * 0.22;`);
  }

  function buildingMaterial(st, top) {
    const m = new THREE.MeshStandardMaterial({ color: st.wall, roughness: st.win === 'glass' ? 0.35 : 0.82, metalness: st.win === 'glass' ? 0.25 : 0.0, envMapIntensity: LK.env });
    const u = {
      uRoof: { value: new THREE.Color(st.roof) }, uTrim: { value: new THREE.Color(st.trim) },
      uGlass: { value: st.win === 'glass' ? curtainCol : glassCol }, uWin: { value: winCol }, uHiColor: { value: hiCol },
      uStyle: { value: WIN_STYLE[st.win] != null ? WIN_STYLE[st.win] : 0 }, uBrick: { value: st.brick ? 1 : 0 },
      uFloorH: { value: S.floorHeight }, uLit: { value: C.perf.windowLights ? (st.lit != null ? st.lit : 0.42) * LK.windowLit : 0 },
      uTop: { value: top }, uHi: { value: 0 }, uDim: { value: 0 }, uLight: { value: LK.buildingLight }
    };
    m.onBeforeCompile = sh => patchBuilding(sh, u);
    m.customProgramCacheKey = () => 'campus-building';
    m.userData.u = u;
    return m;
  }

  function styleOf(b) {
    const o = S.overrides[b.id] || {};
    return Object.assign({ roofType: 'flat', win: 'grid' }, S.presets[o.preset || S.defaultPreset], o);
  }

  function obb(p) {                                // 最小外接矩形（長軸方向）
    let best = null;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
      const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      p.forEach(([x, y]) => { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) best = { area, c, s, u0, u1, v0, v1 };
    }
    let { c, s, u0, u1, v0, v1 } = best, L = u1 - u0, W = v1 - v0;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const cx = cu * c - cv * s, cz = cu * s + cv * c;
    if (W > L) { [L, W] = [W, L]; [c, s] = [-s, c]; }
    return { cx, cz, ux: c, uz: s, L, W };
  }

  function hipRoof(o, y, overhang) {               // 四坡屋頂
    const a = o.L / 2 + overhang, b = o.W / 2 + overhang, r = Math.max(0, a - b), h = Math.min(o.W * 0.3, 7);
    const P = (du, dv, dy) => new THREE.Vector3(o.cx + o.ux * du - o.uz * dv, y + dy, o.cz + o.uz * du + o.ux * dv);
    const c1 = P(a, b, 0), c2 = P(-a, b, 0), c3 = P(-a, -b, 0), c4 = P(a, -b, 0), r1 = P(r, 0, h), r2 = P(-r, 0, h);
    const pos = [];
    [[c1, c2, r2], [c1, r2, r1], [c3, c4, r1], [c3, r1, r2], [c4, c1, r1], [c2, c3, r2]].forEach(([A, Bv, Cv]) => {
      const n = new THREE.Vector3().crossVectors(Bv.clone().sub(A), Cv.clone().sub(A));
      (n.y < 0 ? [A, Cv, Bv] : [A, Bv, Cv]).forEach(v => pos.push(v.x, v.y, v.z));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return { geo: g, height: h };
  }

  // 不規則平面的斜屋頂：沿實際輪廓往內收到 25%，屋簷外推 4%，屋頂一定貼合建築
  function footprintRoof(p, y, h) {
    const cx = p.reduce((a, v) => a + v[0], 0) / p.length, cz = p.reduce((a, v) => a + v[1], 0) / p.length;
    const at = (v, k, dy) => new THREE.Vector3(cx + (v[0] - cx) * k, y + dy, cz + (v[1] - cz) * k);
    const pos = [], push = (...vs) => {
      const n = new THREE.Vector3().crossVectors(vs[1].clone().sub(vs[0]), vs[2].clone().sub(vs[0]));
      (n.y < 0 ? [vs[0], vs[2], vs[1]] : vs).forEach(v => pos.push(v.x, v.y, v.z));
    };
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b2 = p[(i + 1) % p.length];
      const A = at(a, 1.04, 0), Bv = at(b2, 1.04, 0), A2 = at(a, 0.25, h), B2 = at(b2, 0.25, h);
      push(A, Bv, B2); push(A, B2, A2);
      push(at(a, 0.25, h), at(b2, 0.25, h), new THREE.Vector3(cx, y + h, cz));   // 屋脊平台
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return { geo: g, height: h };
  }

  function extrude(p, h) {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, -y))), { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  const eventMeshes = {};
  function makeBuilding(b, st, ox, oz) {
    // 高度優先序：building_styles 的 floors（照片確認的例外）→ OSM 樓層數 → OSM 估計高度
    const H = st.floors ? st.floors * S.floorHeight : b.lv ? b.lv * S.floorHeight : b.h;
    const mat = buildingMaterial(st, H);
    const m = new THREE.Mesh(extrude(b.p, H), mat);
    m.castShadow = m.receiveShadow = useShadows;
    let top = H;
    const o = obb(b.p);
    // 四坡屋頂只用在接近矩形的建築（面積 / 外接矩形 ≥ 0.82），否則外接矩形會比建築大很多
    const area = Math.abs(b.p.reduce((a, [x, y], i) => { const [x2, y2] = b.p[(i + 1) % b.p.length]; return a + x * y2 - x2 * y; }, 0)) / 2;
    if (st.roofType === 'hip') {
      const r = area / (o.L * o.W) >= 0.82 ? hipRoof(o, H, 0.8) : footprintRoof(b.p, H, Math.min(Math.sqrt(area) * 0.18, 6));
      const rm = new THREE.Mesh(r.geo, mat); rm.castShadow = rm.receiveShadow = useShadows;
      m.add(rm); top += r.height;
    } else if (st.rooftop && o.L * o.W > 500) {    // 頂樓機房
      const bm = new THREE.Mesh(new THREE.BoxGeometry(o.L * 0.3, 3.6, o.W * 0.35),
        buildingMaterial(Object.assign({}, st, { win: 'none', wall: st.roof }), H + 3.6));
      bm.position.set(o.cx, H + 1.8, o.cz);
      bm.rotation.y = -Math.atan2(o.uz, o.ux);
      bm.castShadow = bm.receiveShadow = useShadows;
      m.add(bm); top += 3.6;
    }
    m.userData.height = top;
    m.userData.center = [b.p.reduce((a, v) => a + v[0], 0) / b.p.length + ox, b.p.reduce((a, v) => a + v[1], 0) / b.p.length + oz];
    m.position.set(ox, 0, oz);
    scene.add(m);
    return m;
  }
  B.forEach(b => { const m = makeBuilding(b, styleOf(b), 0, 0); if (b.ev) eventMeshes[b.id] = m; });

  // ---------- 南部院區（簡易版；放在 x = SOUTH_OFF 遠處，切換院區時鏡頭飛過去）----------
  const SOUTH = window.CAMPUS_SOUTH, CF = window.CUSTOM_FEATURES || {};
  const SOUTH_OFF = (CF.south && CF.south.offset) || [15000, 0];
  if (SOUTH) {
    SOUTH.buildings.forEach(b => {
      const o = S.overrides[b.id] || {};
      const st = Object.assign({ roofType: 'flat', win: 'grid', floors: b.lv || (b.gh ? 2 : 4) }, S.presets[o.preset || (b.gh ? 'greenhouse' : 'parkModern')], o);
      eventMeshes['s' + b.id] = makeBuilding(b, st, SOUTH_OFF[0], SOUTH_OFF[1]);
    });
    const g = new THREE.CircleGeometry(2600, 64);                  // 簡易地面：草地，邊緣融入霧色
    const col = new Float32Array(g.attributes.position.count * 3), cg = new THREE.Color(LK.ground.grass), cf = new THREE.Color(LK.fog), c = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i++) {
      const r = Math.hypot(g.attributes.position.getX(i), g.attributes.position.getY(i));
      c.copy(cg).lerp(cf, THREE.MathUtils.smoothstep(r, 900, 2500)); col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const gm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.2 }));
    gm.rotation.x = -Math.PI / 2; gm.position.set(SOUTH_OFF[0], 0, SOUTH_OFF[1]); gm.receiveShadow = useShadows;
    scene.add(gm);
    const cs = new THREE.Shape(SOUTH.campus.map(([x, y]) => new THREE.Vector2(x, -y)));  // 院區範圍（較亮的草地）
    const cm = new THREE.Mesh(new THREE.ShapeGeometry(cs).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: LK.ground.flat, roughness: 0.95, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -1 }));
    cm.position.set(SOUTH_OFF[0], 0.05, SOUTH_OFF[1]); cm.receiveShadow = useShadows;
    scene.add(cm);
  }

  // ---------- 地點標籤（建築頂端）----------
  const events = {};
  DATA.events.forEach(e => { events[e.event_id] = e; });
  const locations = DATA.locations.map(l => Object.assign({}, l, { count: l.events.length }));
  const remoteLoc = locations.find(l => l.remote);
  if (SOUTH && remoteLoc && CF.south) {
    const groups = CF.south.places.map(p => ({ name: p.name, match: p.match, building: p.building, events: [], south: true }));
    const other = { name: '南部院區（其他地點）', match: [], building: null, events: [], south: true };
    remoteLoc.events.forEach(id => {
      const pl = events[id].sessions.map(s => s.place || '').join(' ');
      (groups.find(g => g.match.some(m => pl.includes(m))) || other).events.push(id);
    });
    [...groups, other].filter(g => g.events.length).forEach(g => {
      const m = eventMeshes['s' + g.building];
      const c = m ? m.userData.center : [SOUTH_OFF[0], SOUTH_OFF[1]];
      locations.push(Object.assign(g, { count: g.events.length, x: c[0], y: c[1], building: m ? 's' + g.building : null }));
    });
  }
  const maxCount = Math.max(...locations.map(l => l.count));
  const campusLocs = locations.filter(l => !l.remote).sort((a, b) => b.count - a.count);

  campusLocs.forEach((loc, rank) => {
    const mesh = eventMeshes[loc.building];
    const g = new THREE.Group();
    g.position.set(loc.x, (mesh ? mesh.userData.height : 0) + 1, loc.y);
    scene.add(g);
    const el = document.createElement('div');       // 標籤＋細線＋等高空白：細線底端落在屋頂
    el.className = 'holo-pin' + (loc.count / maxCount > 0.15 ? ' hot' : '');
    el.innerHTML = `<div class="holo-label"><span class="hl-count">${loc.count}</span><span class="hl-name">${loc.name}</span></div><i class="hl-stem"></i><i class="hl-spacer"></i>`;
    el.addEventListener('pointerdown', ev => ev.stopPropagation());
    el.querySelector('.holo-label').addEventListener('click', ev => { ev.stopPropagation(); select(loc); });
    loc.ov = addOverlay(el, new THREE.Vector3(loc.x, g.position.y, loc.y), 100 - rank);
    Object.assign(loc, { group: g, mesh, labelEl: el, rank });
  });

  let selected = null, hovered = null, flight = null, labelDirty = true, lastLabelT = 0;
  const _v = new THREE.Vector3(), _lastCam = new THREE.Matrix4(); let _lastProj = 0;

  function refreshLabels() { labelDirty = true; }

  // 標籤避讓：所有單位名稱都顯示；會重疊時往上抬（細線連回屋頂），活動多的優先放在最低位置
  const LIFT_MAX = 14, SHIFTS = [0, 0.45, -0.45];
  let labelsFar = null;
  function layoutLabels() {
    const w = container.clientWidth, h = container.clientHeight, placed = [];
    const hit = r => placed.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    const pri = l => (l === selected || l === hovered) ? -1 : l.rank;
    const far = camera.position.distanceTo(controls.target) > 750;       // 拉遠時標籤縮小
    if (far !== labelsFar) { labelsFar = far; labelLayer.classList.toggle('far', far); campusLocs.forEach(l => { l.fullW = 0; }); }
    const LBL = far ? 20 : 24, STEP = LBL + 3;
    campusLocs.forEach(l => l.labelEl.classList.toggle('hidden', !!l.dimmed));
    campusLocs.filter(l => !l.dimmed).sort((a, b) => pri(a) - pri(b)).forEach(l => {
      const el = l.labelEl, lab = el.querySelector('.holo-label');
      el.classList.toggle('selected', l === selected);
      _v.copy(l.ov.p).project(camera);
      if (_v.z > 1) return;
      const x = (_v.x + 1) / 2 * w, y = (1 - _v.y) / 2 * h;
      if (!l.fullW) l.fullW = lab.offsetWidth || 120;
      const W = l.fullW;
      let best = null;
      search: for (let k = 0; k <= LIFT_MAX; k++) {                         // 先試原位，再左右錯開，再往上抬
        for (const sx of SHIFTS) {
          const S = 14 + k * STEP, dx = Math.round(sx * W);
          const r = { x: x - W / 2 + dx - 3, y: y - LBL - S - 2, w: W + 6, h: LBL + 4, S, dx };
          if (!best) best = r;
          if (!hit(r)) { best = r; break search; }
        }
      }
      placed.push(best);
      if (l.lift !== best.S || l.dx !== best.dx) {  // 細線長度 = 抬高量；下方等高空白讓元素中心仍對準屋頂
        l.lift = best.S; l.dx = best.dx;
        el.querySelector('.hl-stem').style.height = best.S + 'px';
        el.querySelector('.hl-spacer').style.height = (LBL + best.S) + 'px';
        lab.style.transform = best.dx ? 'translateX(' + best.dx + 'px)' : '';
        overlaysDirty = true;
      }
    });
    labelDirty = false;
  }

  // ---------- 選取 / 篩選 / 飛行 ----------
  function setHighlight(loc, v) {
    if (loc && loc.mesh) loc.mesh.material.userData.u.uHi.value = v;
  }

  function flyTo(target, distance) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    flight = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toTarget: target.clone(), toPos: target.clone().add(dir.multiplyScalar(distance)) };
  }

  function select(loc) {
    if (selected) setHighlight(selected, 0);
    selected = loc;
    if (loc) {
      if (!!loc.south !== (campus === 'south')) setCampus(loc.south ? 'south' : 'nankang', false);
      setHighlight(loc, 1);
      flyTo(new THREE.Vector3(loc.x, (loc.mesh ? loc.mesh.userData.height : 0) * 0.5, loc.y), isMobile() ? 620 : 520);
    }
    refreshLabels();
    window.dispatchEvent(new CustomEvent('map3d:select', { detail: loc }));
  }

  function flyToPoint(x, z, distance) {            // 飛到任意座標（設施、搜尋結果）
    flyTo(new THREE.Vector3(x, heightAt(x, z), z), distance || 360);
  }

  // ---------- 切換院區（南港 / 南部）----------
  const CAMPUS = {
    nankang: { home: { pos: HOME.pos.clone(), target: HOME.target.clone() }, center: SC.clone() },
    south: { center: new THREE.Vector3(SOUTH_OFF[0] + 100, 0, SOUTH_OFF[1] + 40) }
  };
  CAMPUS.south.home = { target: CAMPUS.south.center.clone(), pos: CAMPUS.south.center.clone().add(HOME.pos.clone().sub(HOME.target).multiplyScalar(0.55)) };
  let campus = 'nankang';
  function setCampus(c, fly) {
    if (!CAMPUS[c]) return;
    const changed = c !== campus;
    campus = c;
    HOME.pos.copy(CAMPUS[c].home.pos); HOME.target.copy(CAMPUS[c].home.target);
    const ctr = CAMPUS[c].center;
    sun.target.position.copy(ctr); sun.position.set(ctr.x + LK.sunPos[0], LK.sunPos[1], ctr.z + LK.sunPos[2]);
    if (fly !== false) flight = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toTarget: HOME.target.clone(), toPos: HOME.pos.clone() };
    if (changed) window.dispatchEvent(new CustomEvent('map3d:campus', { detail: c }));
  }

  function home() {
    select(null);
    flight = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toTarget: HOME.target.clone(), toPos: HOME.pos.clone() };
  }

  function setFilter(fn) {
    campusLocs.forEach(l => {
      l.dimmed = fn ? !fn(l) : false;
      setOverlay(l.ov, !l.dimmed);
      if (l.mesh) l.mesh.material.userData.u.uDim.value = l.dimmed ? 1 : 0;
    });
    refreshLabels();
  }

  // ---------- 滑鼠 / 觸控 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickables = campusLocs.filter(l => l.mesh).map(l => { l.mesh.userData.loc = l; return l.mesh; });
  let downAt = null, lastInteract = performance.now();

  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit && !hit.object.userData.loc.dimmed ? hit.object.userData.loc : null;
  }
  const surface = labelLayer;
  surface.addEventListener('pointerdown', ev => { downAt = [ev.clientX, ev.clientY]; lastInteract = performance.now(); controls.autoRotate = false; flight = null; });
  surface.addEventListener('pointerup', ev => {
    if (downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) < 6) { const loc = pick(ev); if (loc) select(loc); }
    downAt = null;
  });
  surface.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'mouse' || downAt) return;
    const loc = pick(ev);
    if (loc !== hovered) {
      if (hovered && hovered !== selected) setHighlight(hovered, 0);
      hovered = loc;
      if (loc && loc !== selected) setHighlight(loc, 0.35);
      surface.style.cursor = loc ? 'pointer' : '';
      refreshLabels();
    }
  });
  surface.addEventListener('wheel', () => { lastInteract = performance.now(); controls.autoRotate = false; flight = null; }, { passive: true });

  // ---------- 後製：光暈 → 景深模糊（微縮感）→ 色調映射、飽和度、暗角 ----------
  let composer = null, tiltH = null, tiltV = null;
  const FinalShader = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: LK.exposure }, saturation: { value: LK.saturation }, vignette: { value: LK.vignette } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure; uniform float saturation; uniform float vignette; varying vec2 vUv;
      vec3 aces(vec3 x){ x *= exposure; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        c *= 1.0 - vignette * smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(1.3, 1.0)));
        gl_FragColor = vec4(toSRGB(c), 1.0);
      }`
  };

  function setupPost() {
    const w = container.clientWidth, h = container.clientHeight, pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType });
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    if (LK.bloom) composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(w, h), LK.bloom.strength, LK.bloom.radius, LK.bloom.threshold));
    if (LK.tiltShift && THREE.HorizontalTiltShiftShader) {
      tiltH = new THREE.ShaderPass(THREE.HorizontalTiltShiftShader);
      tiltV = new THREE.ShaderPass(THREE.VerticalTiltShiftShader);
      composer.addPass(tiltH); composer.addPass(tiltV);
      updateTilt();
    }
    composer.addPass(new THREE.ShaderPass(FinalShader));
  }
  function updateTilt() {
    if (!tiltH) return;
    const w = container.clientWidth, h = container.clientHeight, k = LK.tiltShift * 2.2;
    tiltH.uniforms.h.value = k / w; tiltH.uniforms.r.value = 0.52;
    tiltV.uniforms.v.value = k / h; tiltV.uniforms.r.value = 0.52;
  }
  function enableBloom(on) {                       // 相容舊介面：on=false 時關閉整套後製
    if (on && !composer && usePost) setupPost();
    else if (!on && composer) {
      composer = null;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = LK.exposure;
    }
  }
  if (usePost) setupPost();

  // ---------- 手機抽屜打開時畫面上推 ----------
  let viewShift = 0, viewShiftTarget = 0;
  function setViewShift(f) { viewShiftTarget = f; }
  // 畫面中心對準「左右面板之間的可見區域」，選取建築時不會偏一邊
  let viewOffX = 0;
  function applyViewShift() {
    const w = container.clientWidth, h = container.clientHeight;
    if (Math.abs(viewShift) < 0.001 && !viewOffX) camera.clearViewOffset();
    else camera.setViewOffset(w, h, viewOffX, h * viewShift, w, h);
    overlaysDirty = labelDirty = true;
  }
  function measurePanels() {
    const w = container.clientWidth, L = document.querySelector('.panel-left'), R = document.querySelector('.panel-right');
    const l = L ? L.getBoundingClientRect().right : 0, r = R ? R.getBoundingClientRect().left : w;
    viewOffX = Math.round(w / 2 - (l + r) / 2);
    applyViewShift();
  }
  function interact() { lastInteract = performance.now(); controls.autoRotate = false; flight = null; }

  // ---------- 視窗縮放 ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    fitPortrait();
    measurePanels();
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    overlaysDirty = true;
    if (composer) { composer.setSize(w, h); updateTilt(); }
    refreshLabels();
  }
  window.addEventListener('resize', resize);

  // ---------- 動畫迴圈 + 自動降級 ----------
  const clock = new THREE.Clock();
  const frameHooks = [];
  let perfFrames = 0, perfFrom = 2.5, perfStage = 0;
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.3);
      const k = ease(flight.t);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      if (flight.t >= 1) flight = null;
    }
    if (C.camera.autoRotate && !flight && !selected && performance.now() - lastInteract > C.camera.idleSeconds * 1000) controls.autoRotate = true;
    if (Math.abs(viewShift - viewShiftTarget) > 0.001) { viewShift += (viewShiftTarget - viewShift) * Math.min(1, dt * 6); applyViewShift(); }
    frameHooks.forEach(f => f(t, dt));

    controls.update();
    if (composer) composer.render(); else renderer.render(scene, camera);
    const camMoved = !camera.matrixWorld.equals(_lastCam) || camera.projectionMatrix.elements[9] !== _lastProj;
    if (camMoved || overlaysDirty) { renderOverlays(); _lastCam.copy(camera.matrixWorld); _lastProj = camera.projectionMatrix.elements[9]; }
    if (labelDirty || (camMoved && t - lastLabelT > 0.12)) { layoutLabels(); lastLabelT = t; }

    // 自動降級：避開開場編譯著色器的前 2.5 秒，每 3 秒量一次 FPS；不足先關後製、再關陰影
    if (perfStage < 2 && t > perfFrom) {
      perfFrames++;
      if (t - perfFrom > 3) {
        const fps = perfFrames / (t - perfFrom);
        perfFrames = 0; perfFrom = t + 1;
        if (fps >= C.perf.minFps) perfStage = 2;
        else if (perfStage === 0 && composer) { enableBloom(false); if (MAP3D.setTreeDensity) MAP3D.setTreeDensity(0.7); perfStage = 1; console.info('[3D] FPS', fps.toFixed(1), '→ 關閉後製特效、樹減量'); }
        else {
          perfStage = 2;
          renderer.shadowMap.enabled = false;
          if (MAP3D.setTreeDensity) MAP3D.setTreeDensity(0.4);
          renderer.setPixelRatio(1);
          scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
          resize();
          console.info('[3D] FPS', fps.toFixed(1), '→ 關閉陰影、降解析度');
        }
      }
    }
  }

  refreshLabels();
  loop();

  window.MAP3D = { setCampus, getCampus: () => campus, campusCenter: () => CAMPUS[campus].center, SOUTH_OFF, controls, interact, measurePanels, addOverlay, setOverlay, lowGpu, gpuName, scene, camera, inCampus, heightAt, flyToPoint, lowPower, useShadows, frameHooks, locations, campusLocs, events, select, home, setFilter, enableBloom, isMobile, setViewShift };
  window.dispatchEvent(new CustomEvent('map3d:ready'));
})();
