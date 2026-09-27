// ============================================================
// 導覽控制：搖桿（平移）、縮放、旋轉、回全景；鍵盤：方向鍵/WASD 平移、+/- 縮放、Q/E 旋轉
// 依賴：main.js 的 MAP3D.camera / controls / interact / frameHooks / home
// ============================================================
(function () {
  const M = window.MAP3D, cam = M.camera, ctl = M.controls, C = window.MAP3D_CONFIG;
  const BOUND = 1300;                              // 目標點可移動範圍（公尺，離院區中心）

  const nav = document.createElement('div');
  nav.className = 'nav';
  nav.innerHTML = `
    <div class="joy" id="joy" title="拖動平移地圖"><div class="joy-ring"></div><div class="joy-knob" id="joy-knob"><i class="fa-solid fa-up-down-left-right"></i></div></div>
    <div class="nav-btns">
      <button data-act="zoomIn" title="放大（+）"><i class="fa-solid fa-plus"></i></button>
      <button data-act="zoomOut" title="縮小（-）"><i class="fa-solid fa-minus"></i></button>
      <button data-act="rotL" title="向左旋轉（Q）"><i class="fa-solid fa-rotate-left"></i></button>
      <button data-act="rotR" title="向右旋轉（E）"><i class="fa-solid fa-rotate-right"></i></button>
      <button data-act="tiltUp" title="俯視（R）"><i class="fa-solid fa-angles-up"></i></button>
      <button data-act="tiltDown" title="斜視（F）"><i class="fa-solid fa-angles-down"></i></button>
    </div>
    <button class="nav-home" data-act="home" title="回到全景"><i class="fa-solid fa-house"></i></button>`;
  document.getElementById('hud').appendChild(nav);

  // 目前的輸入量：joy = 搖桿 (-1~1)，hold = 按住的按鈕，keys = 鍵盤
  const input = { jx: 0, jy: 0, hold: new Set(), keys: new Set() };
  const off = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  M.frameHooks.push((t, dt) => {
    const k = input.keys, h = input.hold;
    let jx = input.jx + (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    let jy = input.jy + (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0);
    const zoom = (h.has('zoomIn') || k.has('zoomIn') ? 1 : 0) - (h.has('zoomOut') || k.has('zoomOut') ? 1 : 0);
    const rot = (h.has('rotL') || k.has('rotL') ? 1 : 0) - (h.has('rotR') || k.has('rotR') ? 1 : 0);
    const tilt = (h.has('tiltUp') || k.has('tiltUp') ? 1 : 0) - (h.has('tiltDown') || k.has('tiltDown') ? 1 : 0);
    if (!jx && !jy && !zoom && !rot && !tilt) return;
    M.interact();
    off.subVectors(cam.position, ctl.target);
    const dist = off.length();
    if (jx || jy) {                                // 平移：依鏡頭朝向，速度隨距離調整
      fwd.set(-off.x, 0, -off.z).normalize(); right.crossVectors(fwd, up).normalize();
      const sp = dist * 0.25 * dt, d = fwd.multiplyScalar(jy * sp).add(right.multiplyScalar(jx * sp));
      const nt = ctl.target.clone().add(d);
      const cc = M.campusCenter();
      if (Math.hypot(nt.x - cc.x, nt.z - cc.z) < BOUND) { ctl.target.copy(nt); cam.position.add(d); }
    }
    if (zoom) {
      const nd = THREE.MathUtils.clamp(dist * Math.pow(0.35, zoom * dt), ctl.minDistance, ctl.maxDistance);
      off.setLength(nd); cam.position.copy(ctl.target).add(off);
    }
    if (rot || tilt) {
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta += rot * dt * 1.1;
      sph.phi = THREE.MathUtils.clamp(sph.phi - tilt * dt * 0.8, ctl.minPolarAngle, ctl.maxPolarAngle);
      off.setFromSpherical(sph); cam.position.copy(ctl.target).add(off);
    }
  });

  // ---------- 搖桿 ----------
  const joy = nav.querySelector('#joy'), knob = nav.querySelector('#joy-knob');
  let joyId = null;
  function joyMove(ev) {
    const r = joy.getBoundingClientRect(), R = r.width / 2 - 14;
    let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy); if (len > R) { dx *= R / len; dy *= R / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, len / R);                // 小範圍內較慢，推到底最快
    input.jx = dx / R * k; input.jy = -dy / R * k;
  }
  joy.addEventListener('pointerdown', ev => { joyId = ev.pointerId; try { joy.setPointerCapture(joyId); } catch (e) { /* 模擬事件無真實指標 */ } joy.classList.add('on'); joyMove(ev); });
  joy.addEventListener('pointermove', ev => { if (ev.pointerId === joyId) joyMove(ev); });
  const joyEnd = ev => { if (ev.pointerId !== joyId) return; joyId = null; input.jx = input.jy = 0; knob.style.transform = ''; joy.classList.remove('on'); };
  joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

  // ---------- 按住連續動作的按鈕 ----------
  nav.querySelectorAll('[data-act]').forEach(b => {
    const act = b.dataset.act;
    if (act === 'home') { b.onclick = () => M.home(); return; }
    b.addEventListener('pointerdown', ev => { ev.preventDefault(); input.hold.add(act); b.classList.add('on'); });
    const stop = () => { input.hold.delete(act); b.classList.remove('on'); };
    b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
  });

  // ---------- 鍵盤（輸入框內不作用）----------
  const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', _: 'zoomOut',
    q: 'rotL', Q: 'rotL', e: 'rotR', E: 'rotR', r: 'tiltUp', R: 'tiltUp', f: 'tiltDown', F: 'tiltDown' };
  window.addEventListener('keydown', ev => {
    if (ev.target instanceof Element && ev.target.closest('input, select, textarea')) return;
    const a = KEYMAP[ev.key]; if (!a) return;
    ev.preventDefault(); input.keys.add(a);
  });
  window.addEventListener('keyup', ev => { const a = KEYMAP[ev.key]; if (a) input.keys.delete(a); });
  window.addEventListener('blur', () => input.keys.clear());
})();
