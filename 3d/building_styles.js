// ============================================================
// 逐棟建築外觀設定（方案 B）
// - presets：外觀樣板；overrides：以 OSM 建築 id 指定樣板或個別參數
// - 參數：
//     wall      外牆顏色（白天真實顏色；夜景會自動調暗）
//     roof      屋頂顏色
//     trim      樓板/腰帶顏色
//     win       窗戶樣式 grid 格子窗 | band 橫向連續窗 | glass 玻璃帷幕 | slit 直條窗 | none 無窗
//     brick     1 = 磚牆紋理
//     roofType  flat 平頂 | hip 四坡屋頂（傳統式）
//     floors    樓層數（只在照片明確與 OSM 不符時設定；否則自動用 OSM building:levels）
//     rooftop   true = 頂樓機房
//     lit       窗戶亮燈比例 0~1
// - ✔ = 已依照片確認（照片在 3d/reference/buildings/，來源與授權見 manifest.json）；？= 推測，待照片確認
// ============================================================
window.BUILDING_STYLES = {
  floorHeight: 3.8,   // 每層樓高（m）
  night: 0.42,        // 夜景外牆亮度倍率（1 = 白天原色）

  presets: {
    brick:       { wall: '#9c5140', roof: '#6d6d6d', trim: '#c9b8a6', win: 'grid',  brick: 1 },
    whiteTile:   { wall: '#dcd9d0', roof: '#8a8f94', trim: '#f2f0ea', win: 'band' },
    beige:       { wall: '#cdbd9c', roof: '#7d7a72', trim: '#e6dcc6', win: 'grid' },
    grey:        { wall: '#9ba1a7', roof: '#6f757b', trim: '#c3c7cb', win: 'band' },
    glass:       { wall: '#5f86a3', roof: '#7d8a94', trim: '#c8d6e0', win: 'glass', lit: 0.28 },
    parkModern:  { wall: '#e4e6e8', roof: '#8d949a', trim: '#6f93ad', win: 'band', lit: 0.45 },
    traditional: { wall: '#e8e1d0', roof: '#a4442f', trim: '#b89a6a', win: 'grid', roofType: 'hip' },
    temple:      { wall: '#b7352b', roof: '#d0762f', trim: '#e3b451', win: 'none', roofType: 'hip' },
    greenhouse:  { wall: '#9fe0d2', roof: '#bff0e6', trim: '#e8fffa', win: 'glass', lit: 0.2 },
    white:       { wall: '#f1f0ec', roof: '#9a9ea3', trim: '#ffffff', win: 'grid' },
    yellow:      { wall: '#dcbc62', roof: '#7a746a', trim: '#f0dca0', win: 'grid' }
  },

  defaultPreset: 'beige',

  overrides: {
    // ---- 國家生技研究園區 ----
    556511681: { preset: 'parkModern', rooftop: true },            // 生醫轉譯中心 ？
    556511678: { preset: 'parkModern' },                           // 核心主題中心 ？
    556511679: { preset: 'glass' },                                // 生物技術開發中心 ？
    556511683: { preset: 'parkModern' },                           // 食品藥物署辦公室 ？
    556511676: { preset: 'glass' },                                // 生物資訊中心 ？
    556511687: { preset: 'parkModern' },                           // 國家實驗動物中心 ？
    556511689: { preset: 'grey' },                                 // （未命名）？
    1117935564: { preset: 'glass', floors: 2 },                    // 曉風生態展示館 ？

    // ---- 生命科學區 ----
    244256892: { preset: 'glass', rooftop: true },                 // 跨領域科技研究大樓 ？
    198256221: { wall: '#c7713f', roof: '#6f8a5a', trim: '#dcd6cc', win: 'grid', rooftop: true },  // 生物醫學科學研究所（陶土橘、退台綠屋頂）✔
    127948727: { preset: 'whiteTile' },                            // 檢驗及疫苗研製中心 ？
    127948720: { wall: '#eeeeea', roof: '#8f9398', trim: '#d9d9d4', win: 'grid', rooftop: true },   // 分子生物研究所（白色長條樓）✔
    127948732: { wall: '#dccaa8', roof: '#8a8a86', trim: '#c9703c', win: 'grid', rooftop: true },  // 細胞與個體生物學研究所（米黃磁磚＋橘色窗帶）✔
    127948740: { preset: 'whiteTile', rooftop: true },             // 生物化學研究所 ？
    127948736: { wall: '#b95d3c', roof: '#7d7a74', trim: '#efece6', win: 'grid', floors: 7, rooftop: true },  // 植物暨微生物學研究所（橘紅磁磚、白窗框）✔
    127949221: { wall: '#c0643f', roof: '#7d7a74', trim: '#9aa0a6', win: 'slit', floors: 7, rooftop: true },  // 農業生物科技研究中心（磚牆＋金屬格柵）✔（樓層以照片為準：照片約 7 層，OSM 寫 5 層）
    127949214: { wall: '#8fa0ad', roof: '#7d8a94', trim: '#c8d0d6', win: 'glass', rooftop: true }, // 基因體研究中心（灰色玻璃高樓）✔
    1393171243: { wall: '#d0d1cd', roof: '#9a9c9a', trim: '#e8e8e4', win: 'band', floors: 2 },               // 生態時代館（灰白清水模、弧形）✔
    156281380: { preset: 'greenhouse' },                // 中央研究院溫室（新溫室大樓）？
    199925649: { wall: '#9d9d98', roof: '#cfeee6', trim: '#c9c9c4', win: 'glass' },               // 植物分子育種溫室（清水模＋玻璃溫室頂）✔
    127948723: { preset: 'yellow' },                               // 黃樓（依名稱）
    127948729: { preset: 'white' },                                // 白樓（依名稱）

    // ---- 數理科學區 ----
    254291328: { wall: '#a94c3e', roof: '#7d7a74', trim: '#f0efe9', win: 'grid', rooftop: true },  // 物理研究所（紅磚＋白框、弧形玻璃入口）✔
    127950348: { wall: '#b0553d', roof: '#7d7a74', trim: '#e8e2d6', win: 'grid', rooftop: true, brick: 1 }, // 地球科學研究所（紅磚、圓筒形大廳）✔
    3409274: { wall: '#c2735a', roof: '#8a8a86', trim: '#aaa9a3', win: 'grid' },                 // 統計科學研究所（鮭紅磚＋灰色混凝土框、頂部格架）✔
    127949212: { wall: '#c9542f', roof: '#7d7a74', trim: '#dcdcd6', win: 'grid', floors: 7, rooftop: true },  // 化學研究所（橘紅牆＋白色直向柱列）✔（樓層以照片為準：照片約 7 層，OSM 寫 4 層）
    127949217: { wall: '#a8483a', roof: '#7d7a74', trim: '#eeece6', win: 'grid', rooftop: true, brick: 1 }, // 資訊科學研究所（紅磚、白窗框）✔
    127948742: { preset: 'glass' },                                // 資訊科技創新研究中心 ？
    754128631: { preset: 'glass', rooftop: true },                 // 環境變遷研究大樓 ？
    155114992: { preset: 'grey' },                                 // 環境變遷研究中心 ？
    344664763: { preset: 'grey' },                                 // 高能物理與科學計算中心 ？

    // ---- 人文社會科學區 ----
    127948707: { wall: '#dcbcaa', roof: '#8d8f92', trim: '#f0e6de', win: 'band' },                 // 人文社會科學館（低樓層基座，粉米磁磚＋弧形玻璃）✔
    156194540: { wall: '#dcbcaa', roof: '#8d8f92', trim: '#efe4dc', win: 'grid', rooftop: true },  // 人文社會科學館北棟（粉米磁磚高樓）✔
    237887421: { wall: '#6f93ad', roof: '#8d8f92', trim: '#c8d6e0', win: 'glass', rooftop: true }, // 人文社會科學館南棟（弧形玻璃量體）✔
    127949211: { wall: '#a9473a', roof: '#7d7a74', trim: '#ecebe6', win: 'band' },                 // 人文社會科學研究中心（紅磚＋白色水平陽台帶）✔
    127950357: { wall: '#e7e4dc', roof: '#6d7075', trim: '#b8473a', win: 'grid' },                  // 民族學研究所（白牆、鋸齒山牆、紅白條紋塔；平面不規則→平頂）✔
    127948721: { wall: '#dcdcd3', roof: '#8f9398', trim: '#f2f2ee', win: 'grid', floors: 3 },                 // 經濟研究所（淺灰白、直向鰭板）✔（樓層以照片為準：2024 照片為 3 層，OSM 寫 6 層）
    3398848:   { preset: 'traditional' },                          // 歷史語言研究所（歷史文物陳列館）？
    127950359: { wall: '#c7704a', roof: '#8a8a86', trim: '#aaa9a3', win: 'grid' },                 // 歷史語言研究所研究大樓（灰色石框＋橘磚）✔
    127948734: { wall: '#f0efea', roof: '#6f6a64', trim: '#b8322a', win: 'grid', floors: 4 },                 // 傅斯年圖書館（白色、紅色門框；僅有入口照）？
    127950355: { preset: 'beige' },                                // 中國文哲研究所 ？
    127949216: { preset: 'brick' },                                // 近史所檔案館 ？
    127949218: { wall: '#e3dcc6', roof: '#7d8a80', trim: '#f2eee2', win: 'grid' },                 // 近代史研究所（米白、綠色玻璃）✔
    198260128: { preset: 'brick' },                                // 近史所 ？
    127949220: { preset: 'brick' },                                // 近代史研究所 ？
    253582198: { preset: 'brick' },                                // 郭廷以圖書館 ？
    127950352: { wall: '#c9a58a', roof: '#8b8f93', trim: '#eee8e0', win: 'grid', floors: 3 },                 // 歐美所圖書館（同歐美所）？
    127950356: { wall: '#c9a58a', roof: '#8b8f93', trim: '#a4473a', win: 'grid', floors: 5 },                 // 歐美研究所（磚紅底層＋米粉色上層）✔
    3404922:   { preset: 'beige' },                                // 臺灣考古館 ？
    155778597: { wall: '#b0503d', roof: '#7d7a74', trim: '#e6e0d6', win: 'grid', brick: 1 },      // 嶺南美術館（紅磚）✔
    127948725: { wall: '#ece8de', roof: '#4f5f6e', trim: '#a4473a', win: 'grid', floors: 1, roofType: 'hip' }, // 胡適紀念館（白牆紅磚腳、藍灰瓦）✔（樓層以照片為準：照片為平房，OSM 寫 4 層）
    127949215: { wall: '#6f8fa3', roof: '#8d8f92', trim: '#b0a08a', win: 'glass' },                // 蔡元培紀念館（玻璃牆＋木平台）✔

    // ---- 行政與生活 ----
    127948733: { wall: '#ebe7dd', roof: '#8a8a86', trim: '#a4473a', win: 'band' },                 // 總辦事處行政大樓（米白＋紅磚窗下牆）✔
    127950349: { wall: '#dededa', roof: '#8f9398', trim: '#c9c9c4', win: 'band' },                 // 學術活動中心（灰白磁磚、橫向窗）✔
    127948735: { preset: 'grey', floors: 4 },                      // 綜合體育館 ？
    127950347: { preset: 'beige', floors: 2 },                     // 北雲餐廳 ？
    127950354: { preset: 'beige' },                     // 歸國學人宿舍 ？
    254447006: { preset: 'temple', floors: 1 },                                                               // 中研福德宮（紅柱、廟）✔
    244256891: { preset: 'grey' },                      // 動物房 ？
    298331464: { preset: 'grey', floors: 1 },                      // 警衛室
    156432989: { preset: 'grey', floors: 2 },                       // 環安衛小組 ？
  }
};
