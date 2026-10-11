// ============================================================
// 活動增減探測：列出每次掃描官網時，活動場數的增減（只記新增與下架，不含內容修改）
// 資料：data/活動增減紀錄.json（爬蟲比對後自動追加）→ 2D 內嵌為 window.EVENT_CHANGELOG、3D 為 3d/data/changelog.js
// 2D 地圖（build_map.py 內嵌本檔）與 3D 地圖（index.html 載入本檔）共用；母檔在 openhouse-3d-main/3d/changelog_ui.js
// 用法：ChangeLogUI.mount({ data, anchor, place, btnClass, btnHtml, theme: 'light'|'dark', hasEvent(id), onEvent(id) })
// ============================================================
(function () {
  const THEME_SHORT = { '兒童科普日': '兒童科普日', '院區開放日': '院區開放日', '南部院區開放日': '南部院區' };
  const THEME_CLS = { '兒童科普日': 'kids', '院區開放日': 'open', '南部院區開放日': 'south' };
  const WEEK = '日一二三四五六';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = `
  .clg-overlay { position: fixed; inset: 0; z-index: 20000; background: rgba(15,23,42,.55); display: none; align-items: center; justify-content: center; padding: 16px; }
  .clg-overlay.open { display: flex; }
  .clg-card { --bg:#fff; --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; --soft:#f8fafc; --add:#15803d; --addbg:#dcfce7; --rem:#b91c1c; --rembg:#fee2e2; --link:#2563eb;
    background: var(--bg); color: var(--fg); width: min(780px, 100%); max-height: min(86vh, 900px); display: flex; flex-direction: column;
    border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.35); overflow: hidden; font-family: 'Noto Sans TC', 'Inter', system-ui, sans-serif; font-size: 13.5px; line-height: 1.5; }
  .clg-card.dark { --bg:#0b1220; --fg:#e2e8f0; --muted:#94a3b8; --line:#1e293b; --soft:#111a2e; --add:#4ade80; --addbg:rgba(74,222,128,.12); --rem:#f87171; --rembg:rgba(248,113,113,.12); --link:#7dd3fc; border: 1px solid #1e3a5f; }
  .clg-head { display: flex; align-items: flex-start; gap: 10px; padding: 14px 18px 10px; border-bottom: 1px solid var(--line); }
  .clg-head h2 { margin: 0; font-size: 17px; font-weight: 900; }
  .clg-head p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .clg-x { margin-left: auto; background: none; border: 0; color: var(--muted); font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1; }
  .clg-sum { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 18px; background: var(--soft); border-bottom: 1px solid var(--line); }
  .clg-stat { padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 12.5px; border: 1px solid var(--line); background: var(--bg); }
  .clg-stat.add { color: var(--add); } .clg-stat.rem { color: var(--rem); }
  .clg-list { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .clg-row { display: grid; grid-template-columns: 150px 108px 1fr; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--line); align-items: start; }
  .clg-row.hd { position: sticky; top: 0; background: var(--bg); color: var(--muted); font-size: 11.5px; font-weight: 800; padding-top: 8px; padding-bottom: 6px; z-index: 1; }
  .clg-time { font-weight: 800; white-space: nowrap; }
  .clg-time small { display: block; color: var(--muted); font-weight: 500; font-size: 11px; }
  .clg-cnt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .clg-delta { display: inline-block; margin-left: 4px; padding: 0 6px; border-radius: 6px; font-weight: 900; font-size: 11.5px; }
  .clg-delta.up { color: var(--add); background: var(--addbg); } .clg-delta.down { color: var(--rem); background: var(--rembg); } .clg-delta.eq { color: var(--muted); background: var(--soft); }
  .clg-items { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .clg-it { display: grid; grid-template-columns: 18px 1fr; gap: 4px; }
  .clg-sign { font-weight: 900; text-align: center; }
  .clg-it.add .clg-sign { color: var(--add); } .clg-it.rem .clg-sign { color: var(--rem); }
  .clg-it .t { font-weight: 700; word-break: break-word; }
  .clg-it a.t { color: var(--link); text-decoration: none; cursor: pointer; } .clg-it a.t:hover { text-decoration: underline; }
  .clg-it.rem .t { text-decoration: line-through; opacity: .75; }
  .clg-it .m { display: block; color: var(--muted); font-size: 11.5px; }
  .clg-tag { display: inline-block; font-size: 10.5px; font-weight: 800; padding: 0 6px; border-radius: 5px; margin-right: 4px; background: var(--soft); border: 1px solid var(--line); }
  .clg-tag.kids { color: #c2410c; } .clg-tag.open { color: #1d4ed8; } .clg-tag.south { color: #15803d; }
  .clg-card.dark .clg-tag.kids { color: #fdba74; } .clg-card.dark .clg-tag.open { color: #93c5fd; } .clg-card.dark .clg-tag.south { color: #86efac; }
  .clg-foot { padding: 9px 18px 12px; color: var(--muted); font-size: 11.5px; border-top: 1px solid var(--line); }
  .clg-empty { padding: 30px 18px; text-align: center; color: var(--muted); }
  @media (max-width: 640px) {
    .clg-overlay { padding: 0; align-items: flex-end; }
    .clg-card { max-height: 88vh; border-radius: 16px 16px 0 0; }
    .clg-row { grid-template-columns: 1fr auto; padding: 10px 14px; }
    .clg-row.hd { display: none; }
    .clg-items { grid-column: 1 / -1; }
    .clg-head, .clg-sum, .clg-foot { padding-left: 14px; padding-right: 14px; }
  }`;

  function fmtTime(t) {                           // "2026/10/08 08:11" → 10/08（三）08:11
    const m = String(t || '').match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/);
    if (!m) return { main: esc(t), sub: '' };
    const wd = WEEK[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
    return { main: `${m[2]}/${m[3]}（${wd}）${m[4]}`, sub: m[1] };
  }

  function mount(opt) {
    const data = Array.isArray(opt.data) ? opt.data : [];
    if (!document.getElementById('clg-css')) {
      const st = document.createElement('style'); st.id = 'clg-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    // 按鈕
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = opt.btnClass || '';
    btn.innerHTML = opt.btnHtml || '📡 活動增減探測';
    btn.title = '列出每次掃描官網時，新上架與下架的活動';
    if (opt.anchor) opt.place === 'before' ? opt.anchor.before(btn) : opt.anchor.after(btn);

    // 視窗
    const ov = document.createElement('div');
    ov.className = 'clg-overlay';
    const entries = data.slice().reverse();         // 最新的在最上面
    const addN = data.reduce((n, e) => n + (e.added || []).length, 0), remN = data.reduce((n, e) => n + (e.removed || []).length, 0);
    const last = data[data.length - 1], first = data[0];
    const restored = data.some(e => e.source);
    const item = (ev, kind) => {
      const can = kind === 'add' && opt.onEvent && (!opt.hasEvent || opt.hasEvent(ev.event_id));
      const title = can ? `<a class="t" data-ev="${esc(ev.event_id)}">${esc(ev.title)}</a>` : `<span class="t">${esc(ev.title)}</span>`;
      const th = THEME_SHORT[ev.theme] || ev.theme || '';
      return `<div class="clg-it ${kind}"><span class="clg-sign">${kind === 'add' ? '＋' : '－'}</span><div>${title}
        <span class="m">${th ? `<span class="clg-tag ${THEME_CLS[ev.theme] || ''}">${esc(th)}</span>` : ''}#${esc(ev.event_id)}${ev.location ? '・' + esc(ev.location) : ''}${kind === 'rem' ? '・已下架' : ''}</span></div></div>`;
    };
    ov.innerHTML = `
      <div class="clg-card ${opt.theme === 'dark' ? 'dark' : ''}" role="dialog" aria-label="活動增減探測">
        <div class="clg-head"><div><h2>📡 活動增減探測</h2><p>每次掃描官網時與前一次比對，記錄新上架與下架的活動（內容修改不列入）</p></div><button class="clg-x" title="關閉">×</button></div>
        ${data.length ? `<div class="clg-sum">
          <span class="clg-stat">目前 ${esc(last.curr)} 場</span>
          <span class="clg-stat add">＋ 新增 ${addN} 場</span>
          <span class="clg-stat rem">－ 下架 ${remN} 場</span>
          <span class="clg-stat">${esc(String(first.time).slice(0, 10))} 起共 ${data.length} 次異動</span>
        </div>
        <div class="clg-list">
          <div class="clg-row hd"><span>探測時間</span><span>場數</span><span>增減</span></div>
          ${entries.map(e => {
            const t = fmtTime(e.time), d = (e.curr || 0) - (e.prev || 0);
            return `<div class="clg-row"><div class="clg-time">${t.main}<small>${t.sub}</small></div>
              <div class="clg-cnt">${esc(e.prev)} → ${esc(e.curr)}<span class="clg-delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'eq'}">${d > 0 ? '+' + d : d < 0 ? d : '±0'}</span></div>
              <div class="clg-items">${(e.added || []).map(x => item(x, 'add')).join('')}${(e.removed || []).map(x => item(x, 'rem')).join('')}</div></div>`;
          }).join('')}
        </div>` : '<div class="clg-empty">目前還沒有探測到活動增減。</div>'}
        <div class="clg-foot">探測時間是掃描官網、發現差異的時間，不一定是官網實際上架時間。${restored ? '較早的紀錄由網站更新紀錄還原。' : ''}點活動名稱可在地圖上查看。</div>
      </div>`;
    document.body.appendChild(ov);
    const open = () => { ov.classList.add('open'); if (typeof window.trackEvent === 'function') window.trackEvent('open_event_changelog'); else if (typeof window.gtag === 'function') window.gtag('event', 'open_event_changelog'); };
    const close = () => ov.classList.remove('open');
    btn.addEventListener('click', open);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.clg-x')) { close(); return; }
      const a = e.target.closest('a[data-ev]');
      if (a && opt.onEvent) { close(); opt.onEvent(a.dataset.ev); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
    return { open, close, button: btn };
  }

  window.ChangeLogUI = { mount };
})();
