// ============================================================
// 設施圖層（接待、餐飲、休憩、哺集乳室、洗手間、飲水、接駁車、停車交通）
// 標籤定位：MAP3D.addOverlay（main.js 的輕量標籤層）
// 資料：CAMPUS_EVENTS.facilities（由 tools/build_data.py 從 index.html 的 allFacilitiesData 抽出）
// 對外：MAP3D.FACILITY_CATS、MAP3D.setFacilities(layerSet, day)、事件 'map3d:facility'（detail = 設施）
// ============================================================
(function () {
  const M = window.MAP3D, FAC = window.CAMPUS_EVENTS.facilities || [];

  // 類別 → 圖示、顏色（圖層列與地圖圖示共用）
  const CATS = {
    '接待與服務':   { icon: 'fa-circle-info',       color: '#3b82f6', short: '接待' },
    '餐飲資訊':     { icon: 'fa-utensils',          color: '#f97316', short: '餐飲' },
    '休憩場所':     { icon: 'fa-couch',             color: '#10b981', short: '休憩' },
    '哺集乳室':     { icon: 'fa-baby',              color: '#ec4899', short: '哺乳' },
    '洗手間':       { icon: 'fa-restroom',          color: '#8b5cf6', short: '洗手間' },
    '箱水及飲水機': { icon: 'fa-faucet-drip',       color: '#06b6d4', short: '飲水' },
    '免費接駁車':   { icon: 'fa-bus',               color: '#eab308', short: '接駁車' },
    '停車與交通資訊': { icon: 'fa-square-parking',  color: '#64748b', short: '停車' }
  };
  M.FACILITY_CATS = CATS;

  const SPOS = {};
  ((window.CAMPUS_SOUTH || {}).facilities || []).forEach(f => { SPOS[f.id] = [f.x + M.SOUTH_OFF[0], f.y + M.SOUTH_OFF[1]]; });
  const pins = FAC.filter(f => CATS[f.cat] && (f.campus !== 'south' || SPOS[f.id])).map(f => {
    if (f.campus === 'south') f = Object.assign({}, f, { x: SPOS[f.id][0], y: SPOS[f.id][1] });
    const c = CATS[f.cat];
    const el = document.createElement('div');
    el.className = 'fac-pin hidden';
    el.style.setProperty('--c', c.color);
    el.innerHTML = `<i class="fa-solid ${c.icon}"></i>`;
    el.title = f.name;
    el.addEventListener('pointerdown', ev => ev.stopPropagation());
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      window.dispatchEvent(new CustomEvent('map3d:facility', { detail: Object.assign({ el }, f) }));
    });
    const o = M.addOverlay(el, new THREE.Vector3(f.x, M.heightAt(f.x, f.y) + 3, f.y), 50);
    M.setOverlay(o, false);
    return { f, el, o };
  });

  M.setFacilities = function (layers, day) {
    pins.forEach(p => {
      const on = layers.has(p.f.cat) && (day === 'all' || !p.f.days.length || p.f.days.includes(day));
      p.el.classList.toggle('hidden', !on);
      M.setOverlay(p.o, on);
    });
  };
  M.facilityCount = (cat, day) => pins.filter(p => p.f.cat === cat && (day === 'all' || !p.f.days.length || p.f.days.includes(day))).length;
})();
