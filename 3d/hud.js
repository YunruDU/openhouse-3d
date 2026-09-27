// ============================================================
// 科技儀表板 HUD（電腦版）— 功能對齊 2D 地圖（index.html）
//   搜尋｜活動日｜報名方式｜學術組別｜活動類型｜時段｜時間軸播放｜現在進行中｜清除條件
//   活動清單（每場次報名狀態）｜熱門地點｜館舍活動｜設施圖層與說明｜南部院區
// 報名狀態邏輯移植自 index.html 的 getEventRegistrationInfo / createApplyTagHtml / getSessionRegistrationStat
// 依賴：main.js（MAP3D）、facilities.js、data/*.js
// ============================================================
(function () {
  const M = window.MAP3D, EVENTS = window.CAMPUS_EVENTS.events;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const track = (name, p) => { try { gtag('event', name, Object.assign({ source: '3d' }, p)); } catch (e) { /* GA 未載入 */ } };

  const DAYS = [
    { key: 'all', label: '全部活動', sub: '' },
    { key: '10/03', label: '兒童科普日', sub: '10/03' },
    { key: '10/17', label: '院區開放日', sub: '10/17' },
    { key: '11/14', label: '南部院區', sub: '11/14' }
  ];
  const CAMPUS_DAYS = ['10/03', '10/17'];
  const GROUPS = [['ALL', '全部學術組別'], ['數理科學', '數理科學組'], ['生命科學', '生命科學組'], ['人文及社會科學', '人文社會組'], ['院本部', '院本部/其他']];
  const TYPES = [...new Set(EVENTS.map(e => e.event_type).filter(Boolean))];
  const TYPE_ICON = { '參觀導覽': 'fa-person-walking', '互動體驗': 'fa-hand-pointer', '成果展示': 'fa-flask', '演講座談': 'fa-microphone', '影片欣賞': 'fa-film', '其他活動': 'fa-star' };
  const T_MIN = 8 * 60, T_MAX = 18 * 60;
  const CATS = M.FACILITY_CATS, LINKS = window.MAP3D_CONFIG.links;

  // ---------- 時間工具 ----------
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const pad2 = d => d.split('/').map(x => x.padStart(2, '0')).join('/');
  function parseSession(t) {                      // "10/03 09:00 -10/03 10:10" → { day, start, end }
    const d = (t || '').match(/\d{1,2}\/\d{1,2}/), tm = (t || '').match(/\d{1,2}:\d{2}/g);
    if (!tm || tm.length < 2) return null;
    return { day: d ? pad2(d[0]) : '', start: toMin(tm[0]), end: toMin(tm[1]) };
  }
  const cleanTime = t => !t ? '依現場公告' : t.trim().replace(/(\d{1,2}\/\d{1,2})\s*(\d{1,2}:\d{2})\s*-\s*\1\s*(\d{1,2}:\d{2})/, '$1 $2~$3').replace(/\s*-\s*/, '~');
  EVENTS.forEach(e => { e._s = e.sessions.map(s => parseSession(s.time)); });

  // ---------- 報名資料（可被 2D 頁面的自訂資料覆蓋，同 index.html）----------
  let REG_DATA = window.CAMPUS_REG;
  try { const c = JSON.parse(localStorage.getItem('custom_registration_data') || 'null'); if (Array.isArray(c) && c.length) REG_DATA = c; } catch (e) { /* 無 */ }
  const norm = s => (s || '').replace(/[\s　 ・·—─－\-:：!！\?？\.,，\(\)（）\-_—]+/g, '').toLowerCase();
  const regById = new Map(), regByTitle = new Map();
  REG_DATA.forEach(r => {
    const id = (r.url || '').split('/').pop();
    if (id) (regById.get(id) || regById.set(id, []).get(id)).push(r);
    const k = norm(r.activity); (regByTitle.get(k) || regByTitle.set(k, []).get(k)).push(r);
  });
  const timeKeys = t => {
    const d = (t || '').match(/(\d{1,2}\/\d{1,2})/), fd = (t || '').match(/(\d{4})-(\d{2})-(\d{2})/), tm = (t || '').match(/(\d{1,2}:\d{2})/);
    return { date: d ? pad2(d[1]) : fd ? `${fd[2]}/${fd[3]}` : '', start: tm ? tm[1].padStart(5, '0') : '' };
  };
  function regInfo(e) {
    if (e._reg) return e._reg;
    if (e.need_apply !== '需報名') return (e._reg = { status: 'walk_in', hasStats: false, sessions: [] });
    let list = regById.get(e.event_id) || regByTitle.get(norm(e.title));
    if (!list) for (const [k, v] of regByTitle) if (k.includes(norm(e.title)) || norm(e.title).includes(k)) { list = v; break; }
    if (!list || !list.length) return (e._reg = { status: 'need_apply', hasStats: false, sessions: [] });
    let act = list;
    if (e.days.length) {
      const byDate = list.filter(r => (r.day_str && e.days.includes(r.day_str)) || (r.date && e.days.some(d => d.replace('/', '-') === (r.date.match(/-(\d{2}-\d{2})/) || [])[1])));
      if (byDate.length) act = byDate;
    }
    let lim = 0, wait = 0, acc = 0, rem = 0, over = false, avail = false, post = false;
    act.forEach(r => { lim += r.limit || 0; wait += r.wait || 0; acc += r.accept || 0; rem += r.remain || 0; if (r.is_post_lottery || r.accept > 0) post = true; if (r.wait > 0) over = true; if (r.remain > 0) avail = true; });
    return (e._reg = { status: 'need_apply', hasStats: true, isPostLottery: post, totalLimit: lim, totalWait: wait, totalAccept: acc, totalRemain: rem,
      totalRegistered: post ? acc + wait : wait, isOverbooked: over, isAvailable: avail, sessions: act });
  }
  function regTag(e) {
    const r = regInfo(e);
    if (e.need_apply !== '需報名') return '<span class="tag-reg walkin"><i class="fa-solid fa-door-open"></i>不需報名</span>';
    if (!r.hasStats || r.totalLimit <= 0) return '<span class="tag-reg"><i class="fa-solid fa-ticket"></i>需報名</span>';
    if (r.isPostLottery) {
      if (r.totalWait > 0) return `<span class="tag-reg over" title="名額 ${r.totalLimit} / 正取 ${r.totalAccept} / 候補 ${r.totalWait}"><i class="fa-solid fa-fire"></i>名額 ${r.totalLimit}｜候 ${r.totalWait}</span>`;
      if (r.totalRemain > 0) return `<span class="tag-reg ok" title="名額 ${r.totalLimit} / 剩餘 ${r.totalRemain}"><i class="fa-solid fa-wand-magic-sparkles"></i>餘 ${r.totalRemain} 席</span>`;
      return `<span class="tag-reg full"><i class="fa-solid fa-check"></i>名額 ${r.totalLimit}（額滿）</span>`;
    }
    return `<span class="tag-reg ${r.isOverbooked ? 'over' : 'ok'}" title="已報名 ${r.totalRegistered} / 名額 ${r.totalLimit}"><i class="fa-solid fa-users"></i>報名 ${r.totalRegistered} / ${r.totalLimit}</span>`;
  }
  function sessionStat(e, s, i) {
    const r = regInfo(e);
    if (!r.hasStats || !r.sessions.length) return null;
    const items = r.sessions, k = timeKeys(s.time);
    return (k.date && k.start && items.find(x => { const t = timeKeys(x.raw_time); return t.date === k.date && t.start === k.start; }))
      || (k.start && items.find(x => timeKeys(x.raw_time).start === k.start))
      || (norm(s.name) && items.find(x => { const n = norm(x.session); return n === norm(s.name) || n.includes(norm(s.name)) || norm(s.name).includes(n); }))
      || (items.length === e.sessions.length && items[i]) || (items.length === 1 && items[0]) || null;
  }
  function sessionChip(st) {
    if (!st) return '';
    if (st.remain > 0) return `<em class="ok">餘 ${st.remain}</em>`;
    if (st.wait > 0) return `<em class="over">候 ${st.wait}</em>`;
    return '<em class="full">額滿</em>';
  }

  // ---------- 狀態與篩選 ----------
  const state = { q: '', day: 'all', apply: 'ALL', group: 'ALL', types: new Set(), t0: T_MIN, t1: T_MAX, clock: null, clockDay: '10/17', mode: 'range',
    layers: new Set(['events']), tab: 'list', detail: null, focus: null };
  const clockDay = () => CAMPUS_DAYS.includes(state.day) ? state.day : state.clockDay;

  function pass(e) {
    if (state.day === '11/14') { if (!(e.theme || '').startsWith('南')) return false; }
    else if (state.day !== 'all' && !e.days.includes(state.day)) return false;
    if (state.group !== 'ALL' && e.group_name !== state.group) return false;
    if (state.types.size && !state.types.has(e.event_type)) return false;
    if (state.apply === '需報名' && e.need_apply !== '需報名') return false;
    if (state.apply === '不需報名' && e.need_apply === '需報名') return false;
    if (state.clock != null) {
      const d = clockDay();
      if (!e._s.some(s => s && (!s.day || s.day === d) && s.start <= state.clock && state.clock < s.end)) return false;
    } else if (state.t0 > T_MIN || state.t1 < T_MAX) {
      if (!e._s.some(s => s && s.start >= state.t0 && s.end <= state.t1)) return false;
    }
    const q = state.q.toLowerCase();
    if (q) {
      if (q === '需報名') return e.need_apply === '需報名';
      if (q === '不需報名' || q === '免報名') return e.need_apply !== '需報名';
      const hay = `${e.title} ${e.organizer} ${e.location} ${e.sessions.map(s => s.speaker + ' ' + s.place).join(' ')} ${e.description} ${e.notes} ${e.event_id} ${e.need_apply} ${e.event_type} ${e.target} ${e.group_name} ${e.theme}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  const filtersActive = () => state.q || state.day !== 'all' || state.apply !== 'ALL' || state.group !== 'ALL' || state.types.size || state.t0 > T_MIN || state.t1 < T_MAX || state.clock != null;
  const eventsOf = loc => loc.events.map(id => M.events[id]).filter(Boolean);
  const remote = M.locations.find(l => l.remote);

  // ---------- 版面 ----------
  const countDay = k => k === 'all' ? EVENTS.length : k === '11/14' ? EVENTS.filter(e => (e.theme || '').startsWith('南')).length : EVENTS.filter(e => e.days.includes(k)).length;
  const search = document.createElement('div');
  search.className = 'search';
  search.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><input id="q" type="search" autocomplete="off" placeholder="搜尋活動名稱、講者、主題或館舍…"><div class="suggest" id="suggest"></div>`;
  $('.topbar .brand').after(search);
  const campusSeg = document.createElement('div');
  campusSeg.className = 'campus-seg';
  campusSeg.innerHTML = '<button data-c="nankang" class="on">南港院區</button><button data-c="south">南部院區</button>';
  search.after(campusSeg);

  $('#hud').innerHTML = `
    <section class="panel panel-left">
      <div class="panel-head"><span class="tag">SYS</span>活動總覽<span class="blink"></span></div>
      <div class="stats">
        <div class="stat"><b id="st-events">0</b><span>符合活動</span></div>
        <div class="stat"><b id="st-locs">0</b><span>地點</span></div>
        <div class="stat"><b id="st-apply">0</b><span>需報名</span></div>
      </div>
      <div class="gauge-row">
        <svg class="gauge" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="g-bg"/><circle cx="50" cy="50" r="42" class="g-fg" id="g-fg"/></svg>
        <div class="gauge-text"><b id="st-heat">0%</b><span>報名熱度<br><small>已報名 / 名額</small></span></div>
      </div>

      <div class="panel-sub">活動日</div>
      <div class="chips" id="day-chips">${DAYS.map(d => `<button class="chip${d.key === 'all' ? ' on' : ''}" data-day="${d.key}">${d.label}${d.sub ? `<small>${d.sub}</small>` : ''}<span class="n">${countDay(d.key)}</span></button>`).join('')}</div>

      <div class="panel-sub">報名方式</div>
      <div class="seg" id="apply-seg"><button class="on" data-v="ALL">全部</button><button data-v="需報名">需報名</button><button data-v="不需報名">免報名</button></div>

      <div class="panel-sub">學術組別</div>
      <select class="sel" id="group-sel">${GROUPS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>

      <div class="panel-sub">活動類型</div>
      <div class="chips" id="type-chips">${TYPES.map(t => `<button class="chip" data-type="${esc(t)}"><i class="fa-solid ${TYPE_ICON[t] || 'fa-circle'}"></i>${esc(t)}</button>`).join('')}</div>

      <div class="panel-sub">時段 <span class="range-val" id="range-val">不限</span></div>
      <div class="range" id="range">
        <input type="range" id="t0" min="${T_MIN}" max="${T_MAX}" step="30" value="${T_MIN}">
        <input type="range" id="t1" min="${T_MIN}" max="${T_MAX}" step="30" value="${T_MAX}">
        <div class="range-ticks"><span>08</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span></div>
      </div>

      <div class="panel-sub">時間軸</div>
      <div class="timeline-btns">
        <button class="tbtn" id="btn-play"><i class="fa-solid fa-play"></i>播放一天</button>
        <button class="tbtn" id="btn-now"><i class="fa-solid fa-satellite-dish"></i>現在進行中</button>
      </div>

      <button class="reset" id="btn-reset"><i class="fa-solid fa-rotate-left"></i>清除全部條件</button>
    </section>

    <section class="panel panel-right">
      <div class="tabs" id="tabs">
        <button data-tab="list" class="on"><i class="fa-solid fa-list"></i>活動清單 <b id="tab-n">0</b></button>
        <button data-tab="rank"><i class="fa-solid fa-ranking-star"></i>熱門地點</button>
      </div>
      <div id="right-body"></div>
    </section>

    <div class="clock" id="clock" hidden>
      <span class="clock-day" id="clock-day"></span><b id="clock-time">--:--</b><span id="clock-n"></span>
      <input type="range" id="clock-range" min="${T_MIN}" max="${T_MAX}" step="10">
      <button id="clock-stop" title="結束時間軸"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <nav class="dock" id="dock">
      <button class="layer on" data-layer="events" style="--c:#5ef2ff"><i class="fa-solid fa-star"></i><span>活動</span></button>
      ${Object.entries(CATS).map(([k, c]) => `<button class="layer" data-layer="${k}" style="--c:${c.color}"><i class="fa-solid ${c.icon}"></i><span>${c.short}</span><b data-n="${k}"></b></button>`).join('')}
    </nav>

    <button class="remote-card" id="remote-card">
      <span class="tag">南部院區</span>
      <b>${remote ? remote.events.length : 0}</b><span>場活動 · 11/14</span>
      <small>台南 · 點擊查看 <i class="fa-solid fa-arrow-right"></i></small>
    </button>

    <div class="fac-pop" id="fac-pop" hidden></div>
    <div class="toast" id="toast" hidden></div>`;

  const right = $('#right-body');
  function toast(msg) { const t = $('#toast'); t.innerHTML = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4200); }

  // ---------- 活動卡片 ----------
  function sessionsHtml(e) {
    const n = e.sessions.length, open = e._open, list = open ? e.sessions : e.sessions.slice(0, 3);
    const d = clockDay();
    const rows = list.map((s, i) => {
      const p = e._s[i];
      let live = '';
      if (state.clock != null && p && (!p.day || p.day === d)) {
        if (p.start <= state.clock && state.clock < p.end) live = '<em class="live">進行中</em>';
        else if (p.start > state.clock && p.start - state.clock <= 30) live = '<em class="soon">即將開始</em>';
      }
      return `<li>${live}<span class="st">${esc(cleanTime(s.time))}</span>${s.place ? `<span class="sp">${esc(s.place)}</span>` : ''}${sessionChip(sessionStat(e, s, i))}</li>`;
    }).join('');
    return n ? `<ul class="ev-sessions">${rows}</ul>${n > 3 ? `<button class="more" data-more="${e.event_id}">${open ? '收合場次' : `展開其餘場次（共 ${n} 場）`}<i class="fa-solid fa-chevron-${open ? 'up' : 'down'}"></i></button>` : ''}` : '';
  }
  function card(e, showLoc) {
    return `<article class="ev${state.focus === e.event_id ? ' focus' : ''}" data-ev="${e.event_id}">
      <div class="ev-top"><span class="ev-type"><i class="fa-solid ${TYPE_ICON[e.event_type] || 'fa-circle'}"></i>${esc(e.event_type)}</span>${regTag(e)}</div>
      <h3>${esc(e.title)}</h3>
      <div class="ev-meta">
        ${showLoc ? `<a class="ev-loc" data-loc="${esc(e.location)}"><i class="fa-solid fa-location-dot"></i>${esc(e.location)}</a>` : ''}
        <span><i class="fa-regular fa-calendar"></i>${esc(e.days_held_display)}</span>
        <span><i class="fa-solid fa-users"></i>${esc(e.target || '不限')}</span>
        ${e.mode && e.mode !== '實體活動' ? `<span class="online"><i class="fa-solid fa-wifi"></i>${esc(e.mode)}</span>` : ''}
      </div>
      ${sessionsHtml(e)}
      <div class="ev-links">
        <a href="${esc(e.url)}" target="_blank" rel="noopener" class="lk-off" data-t="${esc(e.title)}"><i class="fa-solid fa-arrow-up-right-from-square"></i>活動官網</a>
        ${regInfo(e).hasStats ? `<a href="${LINKS.regDashboard}?search=${encodeURIComponent(e.title)}" target="_blank" class="lk-reg" data-t="${esc(e.title)}"><i class="fa-solid fa-chart-line"></i>報名分析</a>` : ''}
      </div>
    </article>`;
  }
  const byTime = (a, b) => ((a._s[0] || {}).start || 9999) - ((b._s[0] || {}).start || 9999) || a.title.localeCompare(b.title);

  // ---------- 右側內容 ----------
  function renderRight(list) {
    if (state.detail) {
      const loc = state.detail, all = eventsOf(loc), shown = all.filter(pass).sort(byTime);
      right.innerHTML = `
        <div class="detail-head"><button class="back" id="btn-back"><i class="fa-solid fa-chevron-left"></i></button>
          <span class="detail-title">${esc(loc.name)}</span><span class="head-note">${shown.length} 場</span></div>
        ${loc.remote ? '<div class="hint"><i class="fa-solid fa-circle-info"></i> 南部院區為簡易模型；館舍位置部分為推估，<a href="' + LINKS.map2d + '">可在 2D 地圖對照</a></div>' : ''}
        ${all.length > shown.length ? `<div class="hint">另有 ${all.length - shown.length} 場不符合目前條件</div>` : ''}
        <div class="ev-list">${shown.map(e => card(e, false)).join('') || '<div class="hint">沒有符合條件的活動</div>'}</div>`;
      $('#btn-back').onclick = () => { state.detail = null; state.focus = null; M.select(null); };
    } else if (state.tab === 'rank') {
      const rows = M.campusLocs.map(l => ({ l, n: eventsOf(l).filter(pass).length })).filter(r => r.n).sort((a, b) => b.n - a.n);
      const max = rows.length ? rows[0].n : 1;
      right.innerHTML = `<ol class="rank">${rows.map((r, i) => `<li data-loc="${esc(r.l.name)}"><span class="rk">${String(i + 1).padStart(2, '0')}</span><span class="rn">${esc(r.l.name)}<i style="width:${(r.n / max * 100).toFixed(1)}%"></i></span><b>${r.n}</b></li>`).join('') || '<div class="hint">沒有符合條件的地點</div>'}</ol>`;
    } else {
      right.innerHTML = `<div class="ev-list">${list.slice().sort(byTime).map(e => card(e, true)).join('') || '<div class="hint">沒有符合條件的活動，試試「清除全部條件」</div>'}</div>`;
    }
    const f = state.focus && right.querySelector(`[data-ev="${state.focus}"]`);
    if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  right.addEventListener('click', ev => {
    const more = ev.target.closest('[data-more]');
    if (more) { const e = M.events[more.dataset.more]; e._open = !e._open; more.closest('.ev').outerHTML = card(e, !state.detail); return; }
    const lk = ev.target.closest('.lk-off, .lk-reg');
    if (lk) { track(lk.classList.contains('lk-off') ? 'click_official_link' : 'click_reg_detail', { title: lk.dataset.t }); return; }
    const li = ev.target.closest('.rank li');
    if (li) { M.select(M.campusLocs.find(l => l.name === li.dataset.loc)); return; }
    const locA = ev.target.closest('.ev-loc');
    const cardEl = ev.target.closest('.ev');
    if (locA || (cardEl && !state.detail)) {
      const e = M.events[cardEl.dataset.ev], loc = M.locations.find(l => l.name === e.location);
      state.focus = e.event_id;
      if (loc && loc.remote) openRemote(); else if (loc) M.select(loc);
    }
  });

  // ---------- 統計、篩選套用 ----------
  function countUp(el, to, suffix) {
    const from = parseInt(el.textContent) || 0, t0 = performance.now();
    (function step(now) { const k = Math.min(1, (now - t0) / 600); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) + (suffix || ''); if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function apply() {
    const list = EVENTS.filter(pass);
    const locN = new Set(list.map(e => e.location)).size;
    let lim = 0, reg = 0;
    list.forEach(e => { const r = regInfo(e); if (r.hasStats) { lim += r.totalLimit; reg += r.totalRegistered; } });
    const heat = lim ? Math.round(reg / lim * 100) : 0;
    countUp($('#st-events'), list.length); countUp($('#st-locs'), locN);
    countUp($('#st-apply'), list.filter(e => e.need_apply === '需報名').length); countUp($('#st-heat'), heat, '%');
    $('#g-fg').style.strokeDashoffset = 264 * (1 - Math.min(heat, 200) / 200);
    $('#tab-n').textContent = list.length;

    M.setFilter(filtersActive() ? l => eventsOf(l).some(pass) : null);
    M.campusLocs.forEach(l => { l.labelEl.querySelector('.hl-count').textContent = eventsOf(l).filter(pass).length; });
    document.body.classList.toggle('no-event-labels', !state.layers.has('events'));
    const facDay = state.clock != null ? clockDay() : state.day;
    M.setFacilities(state.layers, facDay);
    document.querySelectorAll('[data-n]').forEach(b => { b.textContent = M.facilityCount(b.dataset.n, facDay); });
    $('#remote-card').classList.toggle('dim', CAMPUS_DAYS.includes(state.day));
    if (state.clock != null) {
      $('#clock-n').textContent = `進行中 ${list.length} 場`;
      $('#clock-time').textContent = toHM(state.clock);
      $('#clock-day').textContent = clockDay();
      $('#clock-range').value = state.clock;
    }
    renderRight(list);
  }

  // ---------- 搜尋 ----------
  let qTimer = null;
  const qInput = $('#q'), sug = $('#suggest');
  qInput.addEventListener('input', () => {
    state.q = qInput.value.trim();
    clearTimeout(qTimer);
    if (state.q) qTimer = setTimeout(() => track('search_map', { search_term: state.q }), 700);
    if (state.detail) { state.detail = null; M.select(null); }
    apply(); suggest();
  });
  function suggest() {
    const q = state.q.toLowerCase();
    if (!q) { sug.classList.remove('open'); return; }
    const locs = M.locations.filter(l => l.name.toLowerCase().includes(q)).slice(0, 4);
    const evs = EVENTS.filter(pass).slice(0, 6);
    const facs = (window.CAMPUS_EVENTS.facilities || []).filter(f => f.campus !== 'south' && (f.name.toLowerCase().includes(q) || f.cat.includes(q))).slice(0, 3);
    sug.innerHTML = [
      locs.length ? '<h6>地點</h6>' + locs.map(l => `<a data-sloc="${esc(l.name)}"><i class="fa-solid fa-building"></i>${esc(l.name)}<small>${l.events.length} 場</small></a>`).join('') : '',
      evs.length ? '<h6>活動</h6>' + evs.map(e => `<a data-sev="${e.event_id}"><i class="fa-solid ${TYPE_ICON[e.event_type] || 'fa-circle'}"></i>${esc(e.title)}<small>${esc(e.location)}</small></a>`).join('') : '',
      facs.length ? '<h6>設施</h6>' + facs.map(f => `<a data-sfac="${f.id}"><i class="fa-solid ${CATS[f.cat] ? CATS[f.cat].icon : 'fa-circle'}"></i>${esc(f.name)}<small>${esc(f.cat)}</small></a>`).join('') : ''
    ].join('') || '<div class="hint">找不到符合的結果</div>';
    sug.classList.add('open');
  }
  sug.addEventListener('mousedown', ev => {
    const a = ev.target.closest('a'); if (!a) return;
    ev.preventDefault(); sug.classList.remove('open');
    if (a.dataset.sloc) { const l = M.locations.find(x => x.name === a.dataset.sloc); l.remote ? openRemote() : M.select(l); }
    else if (a.dataset.sev) { const e = M.events[a.dataset.sev], l = M.locations.find(x => x.name === e.location); state.focus = e.event_id; l && (l.remote ? openRemote() : M.select(l)); }
    else if (a.dataset.sfac) { const f = window.CAMPUS_EVENTS.facilities.find(x => x.id === a.dataset.sfac); state.layers.add(f.cat); syncDock(); apply(); M.flyToPoint(f.x, f.y, 300); }
  });
  qInput.addEventListener('blur', () => setTimeout(() => sug.classList.remove('open'), 150));
  qInput.addEventListener('focus', suggest);
  qInput.addEventListener('keydown', ev => { if (ev.key === 'Escape') { qInput.value = ''; qInput.dispatchEvent(new Event('input')); qInput.blur(); } });

  // ---------- 篩選控制 ----------
  $('#day-chips').onclick = ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    state.day = b.dataset.day;
    document.querySelectorAll('#day-chips .chip').forEach(c => c.classList.toggle('on', c === b));
    track('map3d_filter_day', { day: state.day });
    if (state.day === '11/14') openRemote();
    else { if (state.detail && (state.detail.remote || state.detail.south)) state.detail = null; if (M.getCampus() === 'south') M.setCampus('nankang'); apply(); }
  };
  $('#apply-seg').onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    state.apply = b.dataset.v;
    document.querySelectorAll('#apply-seg button').forEach(x => x.classList.toggle('on', x === b));
    track('filter_apply', { apply: state.apply }); apply();
  };
  $('#group-sel').onchange = ev => { state.group = ev.target.value; track('filter_group', { group: state.group }); apply(); };
  $('#type-chips').onclick = ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    const t = b.dataset.type; state.types.has(t) ? state.types.delete(t) : state.types.add(t);
    b.classList.toggle('on', state.types.has(t)); track('filter_type', { type: t }); apply();
  };
  function syncRange() {
    let a = +$('#t0').value, b = +$('#t1').value;
    if (a > b - 30) { if (this && this.id === 't0') a = b - 30; else b = a + 30; $('#t0').value = a; $('#t1').value = b; }
    state.t0 = a; state.t1 = b;
    $('#range-val').textContent = a === T_MIN && b === T_MAX ? '不限' : `${toHM(a)} – ${toHM(b)}`;
    $('#range').style.setProperty('--a', ((a - T_MIN) / (T_MAX - T_MIN) * 100) + '%');
    $('#range').style.setProperty('--b', ((b - T_MIN) / (T_MAX - T_MIN) * 100) + '%');
  }
  ['t0', 't1'].forEach(id => {
    $('#' + id).addEventListener('input', function () { stopClock(); syncRange.call(this); apply(); });
    $('#' + id).addEventListener('change', () => track(id === 't0' ? 'filter_time_start' : 'filter_time_end', { time: toHM(id === 't0' ? state.t0 : state.t1) }));
  });

  // ---------- 時間軸：播放一天 / 現在進行中 ----------
  let playTimer = null, nowTimer = null;
  function startClock(t, mode) {
    state.clock = t; state.mode = mode;
    $('#clock').hidden = false;
    $('#clock').classList.toggle('now', mode === 'now');
    $('#btn-play').classList.toggle('on', mode === 'play');
    $('#btn-now').classList.toggle('on', mode === 'now');
    apply();
  }
  function stopClock() {
    clearInterval(playTimer); clearInterval(nowTimer); playTimer = nowTimer = null;
    if (state.clock == null) return;
    state.clock = null; state.mode = 'range';
    $('#clock').hidden = true;
    $('#btn-play').classList.remove('on'); $('#btn-now').classList.remove('on');
    $('#btn-play').innerHTML = '<i class="fa-solid fa-play"></i>播放一天';
    apply();
  }
  $('#btn-play').onclick = () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('#btn-play').innerHTML = '<i class="fa-solid fa-play"></i>繼續播放'; return; }
    clearInterval(nowTimer); nowTimer = null;
    if (!CAMPUS_DAYS.includes(state.day)) state.clockDay = '10/17';
    startClock(state.clock != null && state.mode === 'play' && state.clock < T_MAX - 10 ? state.clock : T_MIN, 'play');
    $('#btn-play').innerHTML = '<i class="fa-solid fa-pause"></i>暫停';
    track('map3d_timeline', { action: 'play', day: clockDay() });
    playTimer = setInterval(() => {
      if (state.clock >= T_MAX - 10) { clearInterval(playTimer); playTimer = null; $('#btn-play').innerHTML = '<i class="fa-solid fa-rotate-right"></i>重新播放'; return; }
      state.clock += 10; apply();
    }, 700);
  };
  $('#btn-now').onclick = () => {
    const now = new Date(), today = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    track('map3d_timeline', { action: 'now' });
    if (!CAMPUS_DAYS.includes(today) || now.getFullYear() !== 2026) {
      toast('<i class="fa-solid fa-calendar-xmark"></i> 今天不是南港院區活動日（2026/10/03、10/17）。<br>可以用「播放一天」看看活動日的時間流動。');
      return;
    }
    clearInterval(playTimer); playTimer = null;
    state.day = today;
    document.querySelectorAll('#day-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.day === today));
    const tick = () => { const d = new Date(); startClock(Math.max(T_MIN, Math.min(T_MAX, d.getHours() * 60 + d.getMinutes())), 'now'); };
    tick(); nowTimer = setInterval(tick, 60000);
  };
  $('#clock-range').addEventListener('input', ev => {
    clearInterval(playTimer); clearInterval(nowTimer); playTimer = nowTimer = null;
    $('#btn-play').innerHTML = '<i class="fa-solid fa-play"></i>繼續播放';
    state.clock = +ev.target.value; state.mode = 'play'; $('#clock').classList.remove('now'); apply();
  });
  $('#clock-stop').onclick = stopClock;

  // ---------- 清除條件 ----------
  $('#btn-reset').onclick = () => {
    stopClock();
    Object.assign(state, { q: '', day: 'all', apply: 'ALL', group: 'ALL', t0: T_MIN, t1: T_MAX, detail: null, focus: null });
    state.types.clear();
    qInput.value = ''; $('#group-sel').value = 'ALL'; $('#t0').value = T_MIN; $('#t1').value = T_MAX; syncRange();
    document.querySelectorAll('#day-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.day === 'all'));
    document.querySelectorAll('#apply-seg button').forEach(c => c.classList.toggle('on', c.dataset.v === 'ALL'));
    document.querySelectorAll('#type-chips .chip').forEach(c => c.classList.remove('on'));
    track('reset_filters'); M.select(null); apply();
  };

  // ---------- 右側分頁 ----------
  $('#tabs').onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    state.tab = b.dataset.tab; state.detail = null; state.focus = null;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    M.select(null); apply();
  };

  // ---------- 圖層列 ----------
  function syncDock() { document.querySelectorAll('#dock .layer').forEach(b => b.classList.toggle('on', state.layers.has(b.dataset.layer))); }
  $('#dock').onclick = ev => {
    const b = ev.target.closest('.layer'); if (!b) return;
    const k = b.dataset.layer; state.layers.has(k) ? state.layers.delete(k) : state.layers.add(k);
    syncDock(); track('map3d_layer', { layer: k, on: state.layers.has(k) }); apply();
  };

  // ---------- 設施說明卡 ----------
  const pop = $('#fac-pop');
  window.addEventListener('map3d:facility', ev => {
    const f = ev.detail, c = CATS[f.cat], r = f.el.getBoundingClientRect();
    pop.innerHTML = `<button class="x" title="關閉"><i class="fa-solid fa-xmark"></i></button>
      <div class="fp-cat" style="--c:${c.color}"><i class="fa-solid ${c.icon}"></i>${esc(f.cat)}</div>
      <h4>${esc(f.name)}</h4>${f.desc ? `<p>${esc(f.desc)}</p>` : ''}
      <div class="fp-days"><i class="fa-regular fa-calendar"></i>${f.days.length ? esc(f.days.join('、')) : '活動期間'}</div>`;
    pop.hidden = false;
    pop.style.left = Math.min(window.innerWidth - 300, r.left + r.width / 2 - 140) + 'px';
    pop.style.top = Math.max(70, r.top - pop.offsetHeight - 10) + 'px';
    pop.querySelector('.x').onclick = () => { pop.hidden = true; };
    track('map3d_facility', { category: f.cat, name: f.name });
  });
  document.addEventListener('pointerdown', ev => { if (!pop.hidden && !pop.contains(ev.target) && !ev.target.closest('.fac-pin')) pop.hidden = true; });

  // ---------- 南部院區 ----------
  function openRemote() {
    if (!remote) return;
    M.select(null);
    M.setCampus('south');
    state.detail = remote;
    track('map3d_select', { location: '南部院區' });
    apply();
  }
  $('#remote-card').onclick = () => {
    state.day = '11/14';
    document.querySelectorAll('#day-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.day === '11/14'));
    openRemote();
  };

  // ---------- 院區切換（頂部按鈕；選取另一院區的館舍時也會自動切換）----------
  campusSeg.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const c = b.dataset.c;
    track('map3d_campus', { campus: c });
    if (c === 'south') {
      state.day = '11/14';
      document.querySelectorAll('#day-chips .chip').forEach(x => x.classList.toggle('on', x.dataset.day === '11/14'));
      openRemote();
    } else {
      state.day = 'all'; state.detail = null;
      document.querySelectorAll('#day-chips .chip').forEach(x => x.classList.toggle('on', x.dataset.day === 'all'));
      M.select(null); M.setCampus('nankang'); apply();
    }
  };
  window.addEventListener('map3d:campus', ev => {
    campusSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.c === ev.detail));
    $('#remote-card').classList.toggle('dim', ev.detail === 'south');
  });

  // ---------- 3D 選取 ----------
  window.addEventListener('map3d:select', ev => {
    const loc = ev.detail;
    if (loc) { state.detail = loc; track('map3d_select', { location: loc.name }); }
    else if (state.detail && !state.detail.remote) { state.detail = null; state.focus = null; }
    apply();
  });

  syncRange();
  apply();
  M.measurePanels();                              // 面板建好後，讓 3D 畫面中心對準可見區域
})();
