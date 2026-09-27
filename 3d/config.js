// ============================================================
// 3D 地圖設定檔 — 改顏色、光暈、視角、標籤，只要動這個檔案
// ============================================================
window.MAP3D_CONFIG = {
  // ---- 配色（夜景金藍）----
  colors: {
    background: 0x030814,      // 夜空底色
    fog: 0x061226,             // 遠景霧色
    ground: 0x06101f,          // 地面
    grid: 0x1e6fff,            // 地面格線
    hill: 0x0a2226,            // 山丘
    hillLine: 0x2fd6b4,        // 等高線
    building: 0x10223f,        // 一般建築
    buildingEdge: 0x3b82f6,    // 一般建築邊線
    window: 0xffc86b,          // 窗戶燈光
    eventBuilding: 0x2a2140,   // 有活動的建築
    eventEdge: 0xffcf5a,       // 有活動建築的邊線（金）
    highlight: 0x5ef2ff,       // 選取 / 滑過
    boundary: 0x5ef2ff         // 院區邊界圍牆
  },

  // ---- 地形（真實高程）----
  terrain: {
    contourStep: 12,           // 等高線間距（m）
    gridStep: 40,              // 平地格線間距（m）
    wallHeight: 14,            // 院區邊界發光圍牆高度（m）
    cityLights: false          // 101 周圍城市燈點（true 顯示）
  },

  // ---- 光暈（Bloom，僅桌機）----
  bloom: { strength: 0.75, radius: 0.5, threshold: 0.6 },

  // ---- 院區環境（道路、停車場、水池、樹）----
  env: {
    road: 0x0e151d,            // 車道路面
    roadEdge: 0x3fbfff,        // 車道邊線（發光）
    roadCenter: 0xffc86b,      // 寬路中線
    foot: 0x1b2833,            // 步道
    parking: 0x121a24,         // 停車場地面
    stall: 0xcfe8ff,           // 停車格線
    water: 0x0b3b5c,           // 水池、溪流
    waterEdge: 0x4cc9ff,
    pitch: 0x0f3b2c,           // 運動場
    trees: true,               // 顯示樹
    treeScale: 1.8,            // 院區樹大小倍率（1 ≈ 高 7m，1.8 ≈ 高 12m）
    treeScaleMountain: 2.3,    // 後山樹大小倍率
    treeDensity: 0.7,          // 院區附近樹的保留比例（0~1）
    mountainTreeDensity: 0.55, // 後山樹的保留比例
    lowGpu: { treeDensity: 0.35, mountainTreeDensity: 0.25, treeShadows: false, shadowMap: 1024 },  // 偵測到內建顯示卡時改用
    treeColors: [0x2f7d52, 0x3a8a5a, 0x276b47, 0x44956a, 0x2f7a66],
    treeGlow: 0x07261a         // 樹的自發光（夜景下不會整片黑）
  },

  // ---- 相機（從東北方斜看向西南，與空拍圖同角度）----
  camera: {
    fov: 38,
    position: [880, 560, -700],
    target: [-80, 40, 60],
    minDistance: 180,
    maxDistance: 1500,
    minPolar: 0.35,            // 最接近正上方的角度（弧度）
    maxPolar: 1.25,            // 最接近水平的角度（弧度）
    autoRotate: true,          // 閒置時緩慢旋轉
    autoRotateSpeed: 0.25,
    idleSeconds: 12            // 幾秒沒操作後開始自動旋轉
  },

  // ---- 標籤 ----
  // 自動避讓（main.js layoutLabels）：每棟有活動的建築都有標記，依活動數優先顯示完整名稱，重疊的縮成數字圓點
  labels: {},

  // ---- 效能 ----
  perf: {
    mobileBreakpoint: 768,     // 小於此寬度視為手機版面
    desktopPixelRatio: 1.5,
    mobilePixelRatio: 1.5,
    minFps: 28,                // 開場偵測到低於此 FPS 就自動降級
    windowLights: true,        // 建築窗戶燈光效果
    shadowMap: 2048            // 陰影解析度（桌機；手機自動關閉陰影）
  },

  // ---- 連結 ----
  // 外部連結（匯出獨立 Demo 時由 tools/export_demo.py 改成完整網址）
  links: {
    map2d: 'https://yunrudu.github.io/openhouse-demo/MAP/index.html',
    regDashboard: 'https://yunrudu.github.io/openhouse-demo/%E5%A0%B1%E5%90%8D%E5%88%86%E6%9E%90/index.html'
  }
};
