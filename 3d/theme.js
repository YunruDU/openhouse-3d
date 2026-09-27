// ============================================================
// 主題（精緻微縮模型風）：day 白天（預設）/ night 夜景（參考空拍圖 螢幕擷取畫面_2025-06-02_150007.jpg）
// 用法：3d.html?theme=day；頁面右上角按鈕可切換
// 這裡的設定會覆蓋 config.js 同名欄位；要調光線、色調、景深只改這個檔
// ============================================================
(function () {
  const C = window.MAP3D_CONFIG;
  const theme = new URLSearchParams(location.search).get('theme') === 'night' ? 'night' : 'day';
  window.MAP3D_THEME = theme;
  document.documentElement.dataset.theme = theme;

  const THEMES = {
    // ---- 夜景：月光 + 暖色窗光與路燈，像參考圖 608858 的夜間微縮模型 ----
    night: {
      look: {
        skyTop: '#040a1c', skyBottom: '#1b2a4a',
        fog: 0x101a30, fogNear: 1300, fogFar: 4200,
        exposure: 1.3, saturation: 1.08, vignette: 0.28,
        hemiSky: 0x5a78b8, hemiGround: 0x0b1018, hemiIntensity: 0.45,
        sunColor: 0xa9c2ff, sun: 0.55, sunPos: [500, 900, -300],   // 月光
        env: 0.18,                        // 環境反射強度
        shadows: true,
        tiltShift: 1.0,                   // 景深模糊強度（0 關閉）
        bloom: { strength: 0.85, radius: 0.55, threshold: 0.82 },
        stars: true,
        tower: 0x9fdcff, towerGlow: true,
        buildingLight: 0.55,              // 外牆亮度倍率
        windowLit: 1.0,                   // 窗戶亮燈比例倍率
        windowColor: 0xffc877,
        glass: 0x1a2533, curtain: 0x24384d,
        streetLights: true, streetLightColor: 0xffc36b,
        ground: { grass: 0x1d2e25, forest: 0x13241c, rock: 0x2a2d2e, flat: 0x1f2e24, outside: 0x121f18 },
        boundary: false
      },
      env: {
        asphalt: 0x23272d, line: 0xb9bcc0, center: 0xc9a34a, paver: 0x4a4640,
        parking: 0x262a30, stall: 0xd8dade, water: 0x0d2233, pitch: 0x1d3a26,
        pond: 0x0e1f1c, pondBank: 0x1a1d17, reed: 0x2c3d24, lily: 0x1f3a22, deck: 0x3a2e24,
        treeColors: [0x1e3a26, 0x24432b, 0x1a3322, 0x2b4a2e, 0x203d30, 0x2f4d28]
      }
    },
    // ---- 白天：晨光斜射、柔和陰影、空拍色調 ----
    day: {
      look: {
        skyTop: '#7fb2de', skyBottom: '#e6eef2',
        fog: 0xc9d9e3, fogNear: 1700, fogFar: 5200,
        exposure: 0.85, saturation: 1.0, vignette: 0.2,
        hemiSky: 0xdcecff, hemiGround: 0x6b7a55, hemiIntensity: 0.55,
        sunColor: 0xfff0d6, sun: 1.9, sunPos: [700, 800, 350],     // 東南方晨光
        env: 0.55,
        shadows: true,
        tiltShift: 1.0,
        bloom: null,
        stars: false,
        tower: 0x7f97a6, towerGlow: false,
        buildingLight: 1.0,
        windowLit: 0,
        windowColor: 0xffd699,
        glass: 0x3b4b5a, curtain: 0x5f7f99,
        streetLights: false, streetLightColor: 0xffc36b,
        ground: { grass: 0x56733d, forest: 0x2d4a28, rock: 0x77705f, flat: 0x62804a, outside: 0x34502d },
        boundary: false
      },
      env: {
        asphalt: 0x5d6166, line: 0xf4f4f0, center: 0xe6bd48, paver: 0xc9bfae,
        parking: 0x6d7176, stall: 0xffffff, water: 0x4f86a3, pitch: 0x5f9447,
        pond: 0x3e5a4c, pondBank: 0x5d5a41, reed: 0x7d9a45, lily: 0x4f7d3a, deck: 0x8a6a4c,
        treeColors: [0x3a6532, 0x47703a, 0x30562d, 0x557a40, 0x2c5232, 0x62814a]
      }
    }
  };

  (function merge(t, s) {
    Object.keys(s).forEach(k => {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) merge(t[k] = t[k] || {}, s[k]);
      else t[k] = s[k];
    });
  })(C, THEMES[theme]);
})();
