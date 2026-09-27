# 【非官方】院區開放 3D 地圖・個人實驗作品

個人製作的實驗性網站，**不是中央研究院官方網站**。活動資訊請以 [官方網站](https://openhouse.sinica.edu.tw/) 為準。

- 線上 2D 版：https://yunrudu.github.io/openhouse-demo/MAP/index.html
- 由 Claude Opus 5.5（Claude Code）協助開發，約 3 小時完成；製作過程見網頁右下角「關於本站」
- 僅支援電腦瀏覽，手機會轉到 2D 地圖；網址加 `?theme=night` 為夜景版

## 更新方式
這個資料夾是**自動產生**的，請不要直接修改。原始碼在 `openhouse-demo-main/MAP/3d/`：
1. 活動資料有更新：在 `MAP/` 執行 `python 3d/tools/build_data.py`
2. 重新匯出：在 `MAP/` 執行 `python 3d/tools/export_demo.py`
3. 把本資料夾推上 GitHub（GitHub Pages：Settings → Pages → main 分支 / 根目錄）

## 資料來源
© OpenStreetMap contributors（ODbL）· Mapzen Terrain Tiles · Three.js（MIT）· Font Awesome · Google Fonts
