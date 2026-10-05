// ============================================================
// 介面補強（2026-10 新增）
// 1. 面板收合：活動總覽（左）、活動清單（右）各有收合鈕；頂部「導覽模式」一鍵收合兩邊（鍵盤 H）
//    收合狀態記在 localStorage，收合後重新計算 3D 畫面中心（MAP3D.measurePanels）
// 2. 接待處帳篷：在「接待與服務」設施中名稱含「接待處」的點，放白色雙尖頂帳篷（灰色側牆、紅色桌裙）
//    與「A 接待處」字牌；依活動日切換 10/03、10/17 的位置（全部活動日時顯示 10/17 的位置）
// 3. 分享連結：網址 ?day=10/17、?loc=館舍名稱、?event=活動編號 開啟時直接定位（與 2D 地圖相同參數，
//    手機被轉到 2D 時參數會保留）；頂部「複製連結」複製目前選取的館舍與活動日
// 依賴：main.js（MAP3D）、facilities.js（MAP3D.setFacilities）、hud.js（面板 DOM）
// ============================================================
(function () {
  const M = window.MAP3D;
  if (!M) return;

  // ---------------- 1. 面板收合 ----------------
  const KEY = 'map3d-panels-collapsed';
  const left = document.querySelector('.panel-left'), right = document.querySelector('.panel-right');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }

  function setCollapsed(panel, side, on) {
    if (!panel) return;
    panel.classList.toggle('collapsed', on);
    document.body.classList.toggle(side + '-collapsed', on);
    const btn = panel.querySelector('.collapse-btn');
    if (btn) {
      const open = side === 'left' ? 'fa-angles-left' : 'fa-angles-right', shut = side === 'left' ? 'fa-angles-right' : 'fa-angles-left';
      btn.innerHTML = `<i class="fa-solid ${on ? shut : open}"></i>`;
      btn.title = on ? '展開面板' : '收合面板';
    }
    saved[side] = on;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* 無 */ }
    updateGuideBtn();
    requestAnimationFrame(() => M.measurePanels && M.measurePanels());
  }

  function addCollapseBtn(panel, side, host) {
    if (!panel || !host) return;
    const b = document.createElement('button');
    b.className = 'collapse-btn';
    b.type = 'button';
    b.addEventListener('click', ev => { ev.stopPropagation(); setCollapsed(panel, side, !panel.classList.contains('collapsed')); });
    host.appendChild(b);
  }
  addCollapseBtn(left, 'left', left && left.querySelector('.panel-head'));
  addCollapseBtn(right, 'right', right && right.querySelector('.tabs'));
  // 收合時點面板標題（左）或分頁鈕（右）也能展開
  if (left) left.querySelector('.panel-head').addEventListener('click', () => { if (left.classList.contains('collapsed')) setCollapsed(left, 'left', false); });
  if (right) right.querySelector('.tabs').addEventListener('click', e => {
    if (right.classList.contains('collapsed') && e.target.closest('button[data-tab]')) setCollapsed(right, 'right', false);
  });

  // 頂部「導覽模式」：一鍵收合／展開兩邊面板
  const guide = document.createElement('button');
  guide.className = 'btn';
  guide.id = 'btn-guide';
  guide.type = 'button';
  const home = document.getElementById('btn-home');
  if (home) home.before(guide);
  function bothCollapsed() { return !!(left && left.classList.contains('collapsed') && right && right.classList.contains('collapsed')); }
  function updateGuideBtn() {
    const on = bothCollapsed();
    guide.innerHTML = on ? '<i class="fa-solid fa-table-columns"></i><span class="txt">顯示面板</span>' : '<i class="fa-solid fa-expand"></i><span class="txt">導覽模式</span>';
    guide.title = on ? '展開活動總覽與活動清單（鍵盤 H）' : '收合兩側面板，方便向民眾說明路線（鍵盤 H）';
    guide.classList.toggle('on', on);
  }
  function toggleBoth() { const on = !bothCollapsed(); setCollapsed(left, 'left', on); setCollapsed(right, 'right', on); }
  guide.addEventListener('click', toggleBoth);
  document.addEventListener('keydown', e => {
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) toggleBoth();
  });

  setCollapsed(left, 'left', !!saved.left);
  setCollapsed(right, 'right', !!saved.right);

  // ---------------- 2. 接待處帳篷 ----------------
  const FAC = (window.CAMPUS_EVENTS && window.CAMPUS_EVENTS.facilities) || [];
  const SPOS = {};
  ((window.CAMPUS_SOUTH || {}).facilities || []).forEach(f => { SPOS[f.id] = [f.x + M.SOUTH_OFF[0], f.y + M.SOUTH_OFF[1]]; });
  const night = window.MAP3D_THEME !== 'day';
  const SCALE = 2.6;                     // 實際帳篷約 6 x 3 公尺，放大讓遠景也看得到

  const mats = {
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: night ? 0.55 : 0.12 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xb7b9bb, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x9a9c9e, emissiveIntensity: night ? 0.25 : 0 }),
    pole: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.4, metalness: 0.6 }),
    skirt: new THREE.MeshStandardMaterial({ color: 0xa8202a, roughness: 0.7, emissive: 0x7a0c14, emissiveIntensity: night ? 0.5 : 0.08 }),
    top: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.6 }),
    ring: new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.55, depthWrite: false })
  };

  function makeTent() {
    const g = new THREE.Group();
    const side = 3, eave = 2.5, peak = 1.6;           // 單頂：3 x 3 公尺、簷高 2.5、尖頂再高 1.6
    [-side / 2, side / 2].forEach(cx => {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(side / Math.SQRT2, peak, 4, 1), mats.roof);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(cx, eave + peak / 2, 0);
      g.add(roof);
      const valance = new THREE.Mesh(new THREE.BoxGeometry(side, 0.28, side), mats.roof);   // 簷口垂邊
      valance.position.set(cx, eave - 0.1, 0);
      g.add(valance);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, eave, 6), mats.pole);
        p.position.set(cx + sx * side / 2, eave / 2, sz * side / 2);
        g.add(p);
      });
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(side * 2, eave - 0.2), mats.wall);   // 背牆
    back.position.set(0, (eave - 0.2) / 2, -side / 2);
    g.add(back);
    [-side, side].forEach(x => {                                                                // 兩側牆
      const w = new THREE.Mesh(new THREE.PlaneGeometry(side, eave - 0.2), mats.wall);
      w.rotation.y = Math.PI / 2;
      w.position.set(x, (eave - 0.2) / 2, 0);
      g.add(w);
    });
    const table = new THREE.Mesh(new THREE.BoxGeometry(side * 1.8, 0.78, 0.7), mats.skirt);    // 紅色桌裙接待桌
    table.position.set(0, 0.39, side / 2 - 0.6);
    g.add(table);
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(side * 1.82, 0.04, 0.74), mats.top);
    tableTop.position.set(0, 0.8, side / 2 - 0.6);
    g.add(tableTop);
    const ring = new THREE.Mesh(new THREE.RingGeometry(side * 1.35, side * 1.6, 48), mats.ring);  // 地面光圈
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.renderOrder = 2;
    g.add(ring);
    g.traverse(o => { if (o.isMesh && o !== ring) { o.castShadow = !!M.useShadows; o.receiveShadow = !!M.useShadows; } });
    g.scale.setScalar(SCALE);
    return g;
  }

  // 同一個接待處（院區＋字母）在不同活動日可能有不同位置
  const groups = {};
  FAC.filter(f => f.cat === '接待與服務' && /接待處/.test(f.name || '') && (f.campus !== 'south' || SPOS[f.id])).forEach(f => {
    const m = (f.name || '').match(/接待處\s*([A-Z])(?![A-Za-z])/);   // A~D；避免把「Reception」的 R 當成字母
    const letter = m ? m[1] : '';
    const key = (f.campus || '') + '|' + letter;
    const pos = f.campus === 'south' ? SPOS[f.id] : [f.x, f.y];
    (groups[key] = groups[key] || []).push({ f: Object.assign({}, f, { x: pos[0], y: pos[1] }), letter });
  });

  const tents = [];
  Object.values(groups).forEach(list => list.forEach(item => {
    const { f, letter } = item;
    const t = makeTent();
    t.position.set(f.x, M.heightAt(f.x, f.y), f.y);
    t.rotation.y = 0;
    t.visible = false;
    t.userData.facility = f;
    M.scene.add(t);
    const el = document.createElement('div');
    el.className = 'rc-label';
    el.innerHTML = `${letter ? `<b>${letter}</b>` : '<b><i class="fa-solid fa-circle-info"></i></b>'}<span>接待處</span>`;
    el.title = f.name;
    el.addEventListener('pointerdown', ev => ev.stopPropagation());
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      window.dispatchEvent(new CustomEvent('map3d:facility', { detail: Object.assign({ el }, f) }));
    });
    const o = M.addOverlay(el, new THREE.Vector3(f.x, M.heightAt(f.x, f.y) + 4.3 * SCALE + 6, f.y), 60);
    M.setOverlay(o, false);
    item.mesh = t; item.overlay = o;
    tents.push(item);
  }));

  // 依活動日挑每個接待處要顯示的位置：當天有的優先；「全部」時用 10/17（院區開放日）的位置
  function pickFor(list, day) {
    const has = d => list.find(i => (i.f.days || []).includes(d));
    if (day && day !== 'all') return has(day) || null;
    return has('10/17') || has('11/14') || list[0];
  }
  // 只顯示目前院區的接待處（南部院區在場景中位於 15 公里外，字牌仍會被投影到畫面上）
  let shown = new Set(), lastCampus = null;
  function applyTents() {
    const campus = M.getCampus ? M.getCampus() : 'nankang';
    lastCampus = campus;
    tents.forEach(i => {
      const on = shown.has(i) && ((i.f.campus === 'south') === (campus === 'south'));
      i.mesh.visible = on; M.setOverlay(i.overlay, on);
    });
  }
  function updateTents(day) {
    shown = new Set();
    Object.values(groups).forEach(list => { const p = pickFor(list, day); if (p) shown.add(p); });
    applyTents();
  }
  if (Array.isArray(M.frameHooks)) M.frameHooks.push(() => { if (M.getCampus && M.getCampus() !== lastCampus) applyTents(); });

  const origSet = M.setFacilities;
  if (typeof origSet === 'function') {
    M.setFacilities = function (layers, day) { origSet.call(this, layers, day); updateTents(day); };
  }
  updateTents('all');
  M.receptionTents = tents;

  // ---------------- 3. 分享連結 ----------------
  let curLoc = null;
  window.addEventListener('map3d:select', ev => { curLoc = ev.detail || null; });
  window.addEventListener('map3d:campus', ev => { if (ev.detail === 'south') curLoc = null; });
  const normDay = d => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})$/); return m ? m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') : ''; };
  function shareUrl() {
    const p = [];                                  // 不用 URLSearchParams：保留日期的「/」，網址較短、QR Code 較好掃
    const chip = document.querySelector('#day-chips .chip.on');
    const day = chip ? chip.dataset.day : 'all';
    if (curLoc) p.push('loc=' + encodeURIComponent(curLoc.name));
    if (day && day !== 'all') p.push('day=' + day);
    else if (!curLoc && M.getCampus && M.getCampus() === 'south') p.push('day=11/14');
    const qs = p.join('&');
    return location.origin + location.pathname + (qs ? '?' + qs : '');
  }
  function copyText(text, done) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      ok ? done() : window.prompt('請複製以下連結：', text);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  const share = document.createElement('button');
  share.className = 'btn';
  share.id = 'btn-share';
  share.type = 'button';
  share.title = '複製目前館舍與活動日的連結（手機開啟會自動用 2D 地圖）';
  const SHARE_HTML = '<i class="fa-solid fa-link"></i><span class="txt">複製連結</span>';
  share.innerHTML = SHARE_HTML;
  if (home) home.before(share);
  share.addEventListener('click', () => {
    const url = shareUrl();
    copyText(url, () => {
      share.innerHTML = '<i class="fa-solid fa-check"></i><span class="txt">已複製</span>';
      share.classList.add('on');
      setTimeout(() => { share.innerHTML = SHARE_HTML; share.classList.remove('on'); }, 1600);
    });
    if (typeof gtag === 'function') gtag('event', 'map3d_share', { location: curLoc ? curLoc.name : '' });
  });

  // 開啟時依網址參數定位
  const qp = new URLSearchParams(location.search);
  const qDay = normDay(qp.get('day')), qLoc = (qp.get('loc') || '').trim(), qEvent = (qp.get('event') || '').trim();
  if (qDay) {
    const chip = document.querySelector(`#day-chips .chip[data-day="${qDay}"]`);
    if (chip) chip.click();
  }
  if (qEvent || qLoc) {
    setTimeout(() => {
      if (qEvent && M.openEvent && M.openEvent(qEvent)) return;
      if (!qLoc) return;
      const all = M.locations || [];
      const loc = all.find(l => l.name === qLoc) || all.find(l => l.name.includes(qLoc) || qLoc.includes(l.name));
      if (!loc) return;
      if (loc.remote) { const rc = document.getElementById('remote-card'); if (rc) rc.click(); }
      else M.select(loc);
    }, 400);
  }
})();
