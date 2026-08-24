/* ==========================================================================
   app.js —— 管理員介面
   ========================================================================== */
(function () {
  'use strict';

  const T0 = 360, T1 = 1080;             // 甘特圖時間軸範圍（06:00 ~ 18:00）
  const COLORS = ['#F97316', '#0EA5E9', '#10B981', '#8B5CF6', '#F43F5E', '#F59E0B',
                  '#14B8A6', '#6366F1', '#EC4899', '#84CC16'];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fmt = (m) => {
    if (m == null) return '—';
    const h = Math.floor(m / 60), mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };
  const parseTime = (s) => {
    const m = /^(\d{1,2})\s*[:：]\s*(\d{1,2})$/.exec(String(s).trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const money = (n) => Math.round(n).toLocaleString('en-US');
  const signed = (n) => (n < 0 ? '−$' : '+$') + money(Math.abs(n));
  const hhmm = (m) => (m / 60).toFixed(1);

  const PAY_LABEL = { monthly: '月薪', hourly: '時薪', split: '拆帳' };
  const SERVICE_LABEL = { short: '短時 30 分', mid: '中時 45 分', long: '長時 60 分' };
  const STATUS_LABEL = {
    serving: '服務中', traveling: '轉場中', resting: '休息中', off: '休假中', idle: '待命中',
  };
  const STATUS_PILL = {
    serving: 'g', traveling: 'o', resting: 'y', off: 'n', idle: 'n',
  };

  /* ------------------------------------------------------------- 狀態 */

  const data = {
    PARAMS: DATA.PARAMS,
    SKILL_LABEL: DATA.SKILL_LABEL,
    DATE: DATA.DATE,
    caregivers: DATA.caregivers,
    clients: DATA.clients,
    cases: DATA.cases,
  };

  const state = {
    ctx: null,
    weights: { theta: data.PARAMS.theta, lambda: data.PARAMS.lambda.slice() },
    solution: null,
    metrics: null,
    routeOf: {},
    now: 600,
    tab: 'cases',
    showRoutes: true,
    solving: false,
  };

  const colorOf = (wId) => {
    const i = data.caregivers.findIndex((w) => w.id === wId);
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  };
  const cgById = (id) => data.caregivers.find((w) => w.id === id) || null;
  const nameOf = (id) => { const w = cgById(id); return w ? w.name : '—'; };
  const clientOfCase = (kase) => data.clients.find((c) => c.id === kase.clientId);
  const skillNames = (arr) => (arr || []).map((s) => data.SKILL_LABEL[s] || s).join('、');

  /* ------------------------------------------------------------- 求解 */

  function rebuild() {
    state.ctx = SOLVER.makeContext(data);
  }

  function solve(onDone) {
    if (state.solving) return;
    rebuild();
    state.solving = true;
    $('btnSolve').disabled = true;
    $('btnSolve').textContent = '排班計算中…';

    const solver = SOLVER.createSolver(state.ctx, state.weights, { generations: 240 });
    const total = solver.totalGenerations;

    // 分批執行，避免凍結畫面（正式版建議改置於 Web Worker）
    function chunk() {
      const r = solver.step(16);
      $('progressBar').style.width = Math.round((r.generation / total) * 100) + '%';
      if (!r.done) { setTimeout(chunk, 0); return; }

      const best = solver.best;
      state.solution = best.sol;
      state.metrics = best.metrics;
      state.routeOf = {};
      best.sol.routes.forEach((rt) => { state.routeOf[rt.caregiverId] = rt; });

      // 回填案件的「目前安排之居服員」
      data.cases.forEach((c) => { c.assignedTo = null; });
      best.sol.routes.forEach((rt) => {
        rt.stops.forEach((s) => {
          const k = state.ctx.caseById[s.caseId];
          if (k) k.assignedTo = rt.caregiverId;
        });
      });

      state.solving = false;
      $('btnSolve').disabled = false;
      $('btnSolve').textContent = '重新排班';
      setTimeout(() => { $('progressBar').style.width = '0%'; }, 400);
      render();
      if (onDone) onDone();
    }
    setTimeout(chunk, 0);
  }

  /* --------------------------------------------------- 未排入原因分析 */

  function explainUnassigned(caseId) {
    const ctx = state.ctx;
    const kase = ctx.caseById[caseId];
    const cl = ctx.clientById[kase.clientId];
    const lines = [];

    data.caregivers.forEach((w) => {
      if (w.onDuty === false) { lines.push(`${w.name}：今日未出勤`); return; }
      if (cl.excludedCaregivers.indexOf(w.id) >= 0) { lines.push(`${w.name}：列於排除名單`); return; }
      if (cl.requiredGender && cl.requiredGender !== w.gender) {
        lines.push(`${w.name}：性別不符需求（需 ${cl.requiredGender === 'F' ? '女性' : '男性'}）`); return;
      }
      const miss = cl.requiredSkills.filter((s) => w.skills.indexOf(s) < 0);
      if (miss.length) { lines.push(`${w.name}：缺少「${skillNames(miss)}」`); return; }

      const rt = state.routeOf[w.id];
      const seq = rt ? rt.stops.map((s) => s.caseId) : [];
      let ok = false;
      for (let p = 0; p <= seq.length; p++) {
        const trial = seq.slice(); trial.splice(p, 0, caseId);
        if (SOLVER.computeRoute(w, trial, ctx)) { ok = true; break; }
      }
      lines.push(ok
        ? `${w.name}：可插入，但排入後整體目標值下降`
        : `${w.name}：現有行程無法銜接（可出勤 ${fmt(w.available.start)}–${fmt(w.available.end)}）`);
    });
    return lines;
  }

  /* --------------------------------------------------- 即時狀態推算 */

  function stateAt(w, now) {
    const rt = state.routeOf[w.id];
    if (w.onDuty === false) return { status: 'off', pos: w.home, caseId: null };
    if (!rt) return { status: 'idle', pos: w.home, caseId: null };
    if (now < rt.firstStart || now > rt.lastEnd) return { status: 'idle', pos: w.home, caseId: null };

    const ctx = state.ctx;
    let prevEnd = null, prevPos = w.home;
    for (let i = 0; i < rt.stops.length; i++) {
      const s = rt.stops[i];
      const pos = ctx.posOf(s.caseId);
      if (prevEnd != null) {
        const tEnd = prevEnd + s.travelFromPrev;
        if (now >= prevEnd && now < tEnd) {
          const k = s.travelFromPrev ? (now - prevEnd) / s.travelFromPrev : 0;
          return {
            status: 'traveling', caseId: s.caseId,
            pos: { x: prevPos.x + (pos.x - prevPos.x) * k, y: prevPos.y + (pos.y - prevPos.y) * k },
          };
        }
        if (now >= tEnd && now < s.start) return { status: 'resting', pos, caseId: s.caseId };
      }
      if (now >= s.start && now < s.end) return { status: 'serving', pos, caseId: s.caseId };
      prevEnd = s.end; prevPos = pos;
    }
    return { status: 'idle', pos: prevPos, caseId: null };
  }

  /* ------------------------------------------------------------- 提示框 */

  const tip = $('tooltip');
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.classList.add('on');
    const pad = 14;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => tip.classList.remove('on');

  function caseTipHTML(caseId) {
    const ctx = state.ctx;
    const k = ctx.caseById[caseId], cl = ctx.clientById[k.clientId];
    const rt = k.assignedTo ? state.routeOf[k.assignedTo] : null;
    const stop = rt ? rt.stops.find((s) => s.caseId === caseId) : null;
    return `<h4><span class="dot" style="background:${k.assignedTo ? colorOf(k.assignedTo) : '#A8A29E'}"></span>
      ${esc(cl.name)}　<span class="pill o">長照 ${cl.careLevel} 級</span></h4>
      <div class="r"><span>案件編號</span><b>${esc(k.id)}</b></div>
      <div class="r"><span>時間窗</span><b>${fmt(k.window.earliest)}–${fmt(k.window.latest)}</b></div>
      <div class="r"><span>安排時段</span><b>${stop ? fmt(stop.start) + '–' + fmt(stop.end) : '未排入'}</b></div>
      <div class="r"><span>服務時長</span><b>${k.duration} 分（${SERVICE_LABEL[k.serviceType] || k.serviceType}）</b></div>
      <div class="r"><span>預估產出</span><b>$${money(k.revenue)}</b></div>
      <div class="r"><span>指派居服員</span><b>${k.assignedTo ? esc(nameOf(k.assignedTo)) : '—'}</b></div>
      <div class="r"><span>前次居服員</span><b>${cl.lastServedBy ? esc(nameOf(cl.lastServedBy)) : '—'}</b></div>
      <div class="r"><span>特殊需求</span><b>${esc(cl.specialNeeds)}</b></div>
      <div class="r"><span>地址</span><b>${esc(cl.address)}</b></div>`;
  }

  function caregiverTipHTML(w) {
    const rt = state.routeOf[w.id];
    const st = stateAt(w, state.now);
    return `<h4><span class="dot" style="background:${colorOf(w.id)}"></span>${esc(w.name)}
      　<span class="pill ${STATUS_PILL[st.status]}">${STATUS_LABEL[st.status]}</span></h4>
      <div class="r"><span>職稱</span><b>${esc(w.title)}</b></div>
      <div class="r"><span>薪資類型</span><b>${PAY_LABEL[w.payType]}${w.payType === 'split' ? '（' + Math.round(w.splitRatio * 100) + '%）' : ' $' + money(w.payRate)}</b></div>
      <div class="r"><span>可出勤時段</span><b>${fmt(w.available.start)}–${fmt(w.available.end)}</b></div>
      <div class="r"><span>具備技能</span><b>${esc(skillNames(w.skills))}</b></div>
      <div class="r"><span>性格</span><b>${esc((w.personality || []).join('、'))}</b></div>
      <div class="r"><span>今日案件</span><b>${rt ? rt.stops.length : 0} 件</b></div>
      <div class="r"><span>工時 / 空班</span><b>${rt ? hhmm(rt.workMinutes) + ' 小時 / ' + rt.idleMinutes + ' 分' : '—'}</b></div>
      <div class="r"><span>壓力指數</span><b>${rt ? rt.stress.S.toFixed(2) : '0.00'}</b></div>`;
  }

  /* --------------------------------------------------------- 營運指標 */

  function renderKPI() {
    const m = state.metrics;
    if (!m) return;
    $('kpiGrid').innerHTML = `
      <div class="kpi hl"><span class="k">當日毛利</span><span class="v">$${money(m.profit)}</span></div>
      <div class="kpi hl"><span class="k">目標值 F</span><span class="v">${m.fitness.toFixed(3)}</span></div>
      <div class="kpi"><span class="k">服務收入</span><span class="v">$${money(m.revenue)}</span></div>
      <div class="kpi"><span class="k">人力成本</span><span class="v">$${money(m.laborCost)}</span></div>
      <div class="kpi"><span class="k">已排入案件</span><span class="v">${m.assigned}<span class="u">/ ${data.cases.length}</span></span></div>
      <div class="kpi"><span class="k">人均產值</span><span class="v">$${money(m.profit / Math.max(1, state.ctx.onDuty.length))}</span></div>`;

    $('kpiSub').innerHTML = `
      <div class="row"><span>交通成本</span><b>$${money(m.travelCost)}</b></div>
      <div class="row"><span>總工時 / 總空班</span><b>${hhmm(m.workSum)} 小時 / ${m.idleSum} 分</b></div>
      <div class="row"><span>P_fair　壓力不均</span><b>${m.pFair.toFixed(3)}</b></div>
      <div class="row"><span>P_pref　偏好未滿足</span><b>${m.pPref.toFixed(3)}</b></div>
      <div class="row"><span>P_idle　空班比例</span><b>${m.pIdle.toFixed(3)}</b></div>
      <div class="row"><span>可行邊剪枝</span><b>${state.ctx.pruning.kept} / ${state.ctx.pruning.total}</b></div>
      ${m.unassigned ? `<div class="alert">⚠ ${m.unassigned} 件案件無法排入
        <button class="btn icon" id="btnWhy">查看原因</button></div>` : ''}`;

    if ($('btnWhy')) {
      $('btnWhy').addEventListener('click', () => handleChat('為什麼有案件沒排入'));
    }
  }

  function renderStress() {
    const rows = data.caregivers.map((w) => {
      const rt = state.routeOf[w.id];
      const S = rt ? rt.stress.S : 0;
      const off = w.onDuty === false;
      const col = S > 0.75 ? 'var(--bad)' : S > 0.55 ? 'var(--warn)' : colorOf(w.id);
      return `<div class="stress-item">
        <div class="top">
          <span class="who"><span class="dot" style="background:${colorOf(w.id)}"></span>
            ${esc(w.name)} ${off ? '<span class="pill n">未出勤</span>' : ''}</span>
          <span class="num">${S.toFixed(2)}</span>
        </div>
        <div class="track"><i style="width:${Math.round(S * 100)}%;background:${col}"></i></div>
        <div class="meta">${rt
          ? `U ${rt.stress.U.toFixed(2)}　L ${rt.stress.L.toFixed(2)}　C ${rt.stress.C.toFixed(2)}　·　${rt.stops.length} 件 / ${hhmm(rt.workMinutes)} 小時`
          : '今日無排班'}</div>
      </div>`;
    });
    $('stressList').innerHTML = rows.join('');
  }

  /* ----------------------------------------------------------- 甘特圖 */

  const pct = (m) => ((m - T0) / (T1 - T0)) * 100;

  function renderGantt() {
    const ctx = state.ctx;
    let html = '<div class="g-axis">';
    for (let t = T0; t <= T1; t += 60) {
      html += `<div class="tick" style="left:${pct(t)}%">${fmt(t)}</div>`;
    }
    html += '</div>';

    data.caregivers.forEach((w) => {
      const rt = state.routeOf[w.id];
      const off = w.onDuty === false;
      html += `<div class="g-row"${off ? ' style="opacity:.45"' : ''}>
        <div class="g-name" data-cg="${w.id}">
          <span class="n"><span class="dot" style="background:${colorOf(w.id)}"></span>${esc(w.name)}</span>
          <span class="t">${PAY_LABEL[w.payType]}${rt ? ' · ' + hhmm(rt.workMinutes) + 'h' : off ? ' · 未出勤' : ' · 無排班'}</span>
        </div>
        <div class="g-track">`;

      html += `<div class="avail" style="left:${pct(w.available.start)}%;width:${pct(w.available.end) - pct(w.available.start)}%"></div>`;

      if (rt) {
        let prevEnd = null;
        rt.stops.forEach((s) => {
          const k = ctx.caseById[s.caseId];
          const cl = ctx.clientById[k.clientId];
          if (prevEnd != null && s.travelFromPrev > 0) {
            html += `<div class="g-travel" style="left:${pct(prevEnd)}%;width:${pct(prevEnd + s.travelFromPrev) - pct(prevEnd)}%;background-color:${colorOf(w.id)}"></div>`;
          }
          if (s.gap > 0) {
            const gs = prevEnd + s.travelFromPrev;
            html += `<div class="${s.isRest ? 'g-rest' : 'g-rest'}" style="left:${pct(gs)}%;width:${pct(s.start) - pct(gs)}%"></div>`;
          }
          html += `<div class="g-block" data-case="${s.caseId}"
            style="left:${pct(s.start)}%;width:${pct(s.end) - pct(s.start)}%;background:${colorOf(w.id)}">
            ${esc(cl.name)}</div>`;
          prevEnd = s.end;
        });
      }
      html += '</div></div>';
    });

    html += `<div class="g-now" id="nowLine" style="left:calc(96px + ${pct(state.now)}% * (100% - 96px) / 100%)"></div>`;
    const g = $('gantt');
    g.innerHTML = html;

    // now line 需以 track 實際寬度定位
    positionNowLine();

    g.querySelectorAll('.g-block').forEach((el) => {
      el.addEventListener('mousemove', (e) => showTip(caseTipHTML(el.dataset.case), e));
      el.addEventListener('mouseleave', hideTip);
    });
    g.querySelectorAll('.g-name').forEach((el) => {
      el.addEventListener('mousemove', (e) => showTip(caregiverTipHTML(cgById(el.dataset.cg)), e));
      el.addEventListener('mouseleave', hideTip);
    });
  }

  function positionNowLine() {
    const line = $('nowLine');
    const track = document.querySelector('.g-track');
    if (!line || !track) return;
    const g = $('gantt').getBoundingClientRect();
    const t = track.getBoundingClientRect();
    line.style.left = (t.left - g.left + (t.width * (state.now - T0)) / (T1 - T0)) + 'px';
  }

  /* ------------------------------------------------------------- 地圖 */

  function renderMap() {
    const ctx = state.ctx;
    const pts = data.clients.map((c) => c.pos).concat(data.caregivers.map((w) => w.home));
    const pad = 420;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min.apply(null, xs) - pad, maxX = Math.max.apply(null, xs) + pad;
    const minY = Math.min.apply(null, ys) - pad, maxY = Math.max.apply(null, ys) + pad;
    const W = maxX - minX, H = maxY - minY;

    let svg = `<svg viewBox="${minX} ${minY} ${W} ${H}" preserveAspectRatio="xMidYMid meet"
      style="aspect-ratio:${(W / H).toFixed(3)}"><defs>`;
    data.caregivers.forEach((w) => {
      svg += `<marker id="ar-${w.id}" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="${colorOf(w.id)}"/></marker>`;
    });
    svg += '</defs>';

    // 底格線
    svg += `<rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="#FAFAF9"/>`;
    for (let gx = Math.ceil(minX / 1000) * 1000; gx < maxX; gx += 1000) {
      svg += `<line x1="${gx}" y1="${minY}" x2="${gx}" y2="${maxY}" stroke="#F0EFEE" stroke-width="6"/>`;
    }
    for (let gy = Math.ceil(minY / 1000) * 1000; gy < maxY; gy += 1000) {
      svg += `<line x1="${minX}" y1="${gy}" x2="${maxX}" y2="${gy}" stroke="#F0EFEE" stroke-width="6"/>`;
    }

    // 居服員住家
    data.caregivers.forEach((w) => {
      svg += `<rect class="map-home" x="${w.home.x - 55}" y="${w.home.y - 55}" width="110" height="110"
        rx="18" stroke="${colorOf(w.id)}"/>`;
    });

    // 路線
    if (state.showRoutes) {
      Object.keys(state.routeOf).forEach((wid) => {
        const rt = state.routeOf[wid];
        for (let i = 1; i < rt.stops.length; i++) {
          const a = ctx.posOf(rt.stops[i - 1].caseId), b = ctx.posOf(rt.stops[i].caseId);
          if (a.x === b.x && a.y === b.y) continue;
          svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
            stroke="${colorOf(wid)}" stroke-width="14" opacity=".8"
            marker-end="url(#ar-${wid})"/>`;
        }
      });
    }

    // 個案節點
    data.clients.forEach((c) => {
      const todays = data.cases.filter((k) => k.clientId === c.id);
      const assigned = todays.find((k) => k.assignedTo);
      const anyUnassigned = todays.some((k) => !k.assignedTo);
      const col = assigned ? colorOf(assigned.assignedTo) : '#A8A29E';
      const r = 70 + c.careLevel * 12;
      svg += `<circle class="map-node" data-client="${c.id}" cx="${c.pos.x}" cy="${c.pos.y}" r="${r}"
        fill="${col}" fill-opacity="${assigned ? .9 : .35}" stroke="#fff" stroke-width="10"/>`;
      if (anyUnassigned) {
        svg += `<circle cx="${c.pos.x}" cy="${c.pos.y}" r="${r + 34}" fill="none"
          stroke="#DC2626" stroke-width="9" stroke-dasharray="26 20"/>`;
      }
      svg += `<text class="map-label" x="${c.pos.x}" y="${c.pos.y + r + 105}" text-anchor="middle"
        style="font-size:105px">${esc(c.name)}</text>`;
    });

    // 即時定位
    data.caregivers.forEach((w) => {
      const st = stateAt(w, state.now);
      if (!st.pos || st.status === 'off') return;
      svg += `<circle class="gps" cx="${st.pos.x}" cy="${st.pos.y}" r="46" fill="${colorOf(w.id)}"
        stroke-width="18"/>`;
      if (st.status === 'serving') {
        svg += `<circle cx="${st.pos.x}" cy="${st.pos.y}" r="80" fill="none"
          stroke="${colorOf(w.id)}" stroke-width="8" opacity=".5"/>`;
      }
    });

    svg += '</svg>';
    $('mapWrap').innerHTML = svg;

    $('mapWrap').querySelectorAll('.map-node').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const c = data.clients.find((x) => x.id === el.dataset.client);
        const todays = data.cases.filter((k) => k.clientId === c.id);
        showTip(`<h4>${esc(c.name)}　<span class="pill o">長照 ${c.careLevel} 級</span></h4>
          <div class="r"><span>地址</span><b>${esc(c.address)}</b></div>
          <div class="r"><span>電話</span><b>${esc(c.phone)}</b></div>
          <div class="r"><span>今日案件</span><b>${todays.length} 件</b></div>
          ${todays.map((k) => `<div class="r"><span>${fmt(k.window.earliest)} 起 ${k.duration} 分</span>
            <b>${k.assignedTo ? esc(nameOf(k.assignedTo)) : '未排入'}</b></div>`).join('')}
          <div class="r"><span>特殊需求</span><b>${esc(c.specialNeeds)}</b></div>`, e);
      });
      el.addEventListener('mouseleave', hideTip);
    });

    $('mapLegend').innerHTML = data.caregivers.map((w) =>
      `<span class="lg"><i class="dot" style="background:${colorOf(w.id)}"></i>${esc(w.name)}</span>`
    ).join('') + '<span class="lg"><i class="dot" style="background:#A8A29E"></i>未排入</span>';
  }

  /* ------------------------------------------------------------- 清單 */

  const TABS = {
    cases: '當日案件清單（唯讀，下方可測試增刪修改）',
    duty: '當日可出勤員工清單',
    staff: '員工清單',
    clients: '服務個案清單',
  };

  function renderTable() {
    const ctx = state.ctx;
    $('listTitle').textContent = TABS[state.tab].split('（')[0];
    $('btnAdd').style.display = state.tab === 'duty' ? 'none' : '';
    let html = '';

    if (state.tab === 'cases') {
      html = `<table><thead><tr>
        <th>案件編號</th><th>服務個案</th><th>時間窗</th><th>安排時段</th><th>時長</th>
        <th>等級</th><th>目前安排</th><th>預估產出</th><th></th></tr></thead><tbody>`;
      data.cases.forEach((k) => {
        const cl = clientOfCase(k);
        const rt = k.assignedTo ? state.routeOf[k.assignedTo] : null;
        const stop = rt ? rt.stops.find((s) => s.caseId === k.id) : null;
        html += `<tr data-case="${k.id}">
          <td class="num">${esc(k.id.slice(-3))}</td>
          <td>${esc(cl.name)}</td>
          <td class="num">${fmt(k.window.earliest)}–${fmt(k.window.latest)}</td>
          <td class="num">${stop ? fmt(stop.start) + '–' + fmt(stop.end) : '<span class="pill r">未排入</span>'}</td>
          <td class="num">${k.duration}′</td>
          <td><span class="pill o">${cl.careLevel}</span></td>
          <td>${k.assignedTo
            ? `<span class="who-cell"><span class="dot" style="background:${colorOf(k.assignedTo)}"></span>${esc(nameOf(k.assignedTo))}</span>`
            : '<span class="pill n">—</span>'}</td>
          <td class="num">$${money(k.revenue)}</td>
          <td class="actions">
            <button class="btn icon" data-edit="case" data-id="${k.id}">編輯</button>
            <button class="btn icon" data-del="case" data-id="${k.id}">刪除</button></td></tr>`;
      });
      html += '</tbody></table>';

    } else if (state.tab === 'duty') {
      html = `<table><thead><tr>
        <th>編號</th><th>姓名</th><th>當前狀態</th><th>可出勤時段</th><th>薪資類型</th>
        <th>技能</th><th>案件</th><th>工時</th><th>壓力指數</th></tr></thead><tbody>`;
      data.caregivers.forEach((w) => {
        const rt = state.routeOf[w.id];
        const st = stateAt(w, state.now);
        const S = rt ? rt.stress.S : 0;
        html += `<tr>
          <td class="num">${esc(w.id)}</td>
          <td><span class="who-cell"><span class="dot" style="background:${colorOf(w.id)}"></span>${esc(w.name)}</span></td>
          <td><span class="pill ${STATUS_PILL[st.status]}">${STATUS_LABEL[st.status]}</span></td>
          <td class="num">${fmt(w.available.start)}–${fmt(w.available.end)}</td>
          <td>${PAY_LABEL[w.payType]}${w.payType === 'split' ? ' ' + Math.round(w.splitRatio * 100) + '%' : ''}</td>
          <td>${esc(skillNames(w.skills))}</td>
          <td class="num">${rt ? rt.stops.length : 0}</td>
          <td class="num">${rt ? hhmm(rt.workMinutes) + 'h' : '—'}</td>
          <td class="num"><div class="track" style="width:70px;display:inline-block;vertical-align:middle">
            <i style="width:${Math.round(S * 100)}%;background:${S > 0.75 ? 'var(--bad)' : S > 0.55 ? 'var(--warn)' : colorOf(w.id)}"></i>
            </div> ${S.toFixed(2)}</td></tr>`;
      });
      html += '</tbody></table>';

    } else if (state.tab === 'staff') {
      html = `<table><thead><tr>
        <th>編號</th><th>姓名</th><th>職稱</th><th>性別</th><th>薪資類型</th><th>薪資</th>
        <th>技能</th><th>性格</th><th>出勤</th><th></th></tr></thead><tbody>`;
      data.caregivers.forEach((w) => {
        html += `<tr>
          <td class="num">${esc(w.id)}</td>
          <td><span class="who-cell"><span class="dot" style="background:${colorOf(w.id)}"></span>${esc(w.name)}</span></td>
          <td>${esc(w.title)}</td>
          <td>${w.gender === 'F' ? '女' : '男'}</td>
          <td>${PAY_LABEL[w.payType]}</td>
          <td class="num">${w.payType === 'split' ? Math.round(w.splitRatio * 100) + '%' : '$' + money(w.payRate)}</td>
          <td>${esc(skillNames(w.skills))}</td>
          <td>${esc((w.personality || []).join('、'))}</td>
          <td>${w.onDuty === false ? '<span class="pill n">未出勤</span>' : '<span class="pill g">出勤</span>'}</td>
          <td class="actions">
            <button class="btn icon" data-edit="staff" data-id="${w.id}">編輯</button>
            <button class="btn icon" data-del="staff" data-id="${w.id}">刪除</button></td></tr>`;
      });
      html += '</tbody></table>';

    } else {
      html = `<table><thead><tr>
        <th>編號</th><th>姓名</th><th>地址</th><th>電話</th><th>等級</th>
        <th>需求</th><th>指定</th><th>前次</th><th></th></tr></thead><tbody>`;
      data.clients.forEach((c) => {
        html += `<tr>
          <td class="num">${esc(c.id)}</td>
          <td>${esc(c.name)}</td>
          <td>${esc(c.address)}</td>
          <td class="num">${esc(c.phone)}</td>
          <td><span class="pill o">${c.careLevel}</span></td>
          <td>${esc(skillNames(c.requiredSkills))}${c.requiredGender ? '／限' + (c.requiredGender === 'F' ? '女' : '男') : ''}</td>
          <td>${c.designatedCaregivers.map((id) => esc(nameOf(id))).join('、') || '—'}</td>
          <td>${c.lastServedBy ? esc(nameOf(c.lastServedBy)) : '—'}</td>
          <td class="actions">
            <button class="btn icon" data-edit="client" data-id="${c.id}">編輯</button>
            <button class="btn icon" data-del="client" data-id="${c.id}">刪除</button></td></tr>`;
      });
      html += '</tbody></table>';
    }

    const wrap = $('tableWrap');
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-case]').forEach((tr) => {
      tr.addEventListener('mousemove', (e) => {
        if (e.target.closest('button')) { hideTip(); return; }
        showTip(caseTipHTML(tr.dataset.case), e);
      });
      tr.addEventListener('mouseleave', hideTip);
    });
    wrap.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => { hideTip(); openEditor(b.dataset.edit, b.dataset.id); });
    });
    wrap.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => { hideTip(); removeRecord(b.dataset.del, b.dataset.id); });
    });
  }

  /* --------------------------------------------------- 測試面板：增刪改 */

  function removeRecord(kind, id) {
    if (kind === 'case') data.cases = data.cases.filter((c) => c.id !== id);
    else if (kind === 'staff') data.caregivers = data.caregivers.filter((w) => w.id !== id);
    else if (kind === 'client') {
      data.clients = data.clients.filter((c) => c.id !== id);
      data.cases = data.cases.filter((c) => c.clientId !== id);
    }
    solve();
  }

  const modal = { fields: [], onSave: null };

  function openModal(title, fields, onSave) {
    modal.fields = fields; modal.onSave = onSave;
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = fields.map((f, i) => {
      const v = f.value == null ? '' : f.value;
      const input = f.type === 'select'
        ? `<select data-i="${i}">${f.options.map((o) =>
            `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`
        : `<input data-i="${i}" type="${f.type || 'text'}" value="${esc(v)}">`;
      return `<div class="field"><label>${esc(f.label)}</label>${input}
        ${f.hint ? `<div class="fh">${esc(f.hint)}</div>` : ''}</div>`;
    }).join('');
    $('modalBackdrop').classList.add('on');
  }
  const closeModal = () => $('modalBackdrop').classList.remove('on');

  function readModal() {
    const out = {};
    $('modalBody').querySelectorAll('[data-i]').forEach((el) => {
      out[modal.fields[Number(el.dataset.i)].key] = el.value;
    });
    return out;
  }

  const skillOptions = () => Object.keys(data.SKILL_LABEL).map((k) => ({ v: k, t: data.SKILL_LABEL[k] }));

  function openEditor(kind, id) {
    if (kind === 'staff') {
      const w = id ? cgById(id) : null;
      openModal(w ? '修改員工資料' : '新增員工', [
        { key: 'name', label: '姓名', value: w ? w.name : '' },
        { key: 'title', label: '職稱', value: w ? w.title : '居服員' },
        { key: 'gender', label: '性別', type: 'select', value: w ? w.gender : 'F',
          options: [{ v: 'F', t: '女' }, { v: 'M', t: '男' }] },
        { key: 'payType', label: '薪資類型', type: 'select', value: w ? w.payType : 'hourly',
          options: [{ v: 'monthly', t: '月薪' }, { v: 'hourly', t: '時薪' }, { v: 'split', t: '拆帳' }] },
        { key: 'payRate', label: '薪資（月薪：月俸／時薪：時薪率）', value: w ? w.payRate : 220 },
        { key: 'splitRatio', label: '拆帳比例（0~1，僅拆帳制適用）', value: w && w.splitRatio != null ? w.splitRatio : 0.6 },
        { key: 'skills', label: '具備技能', hint: '以頓號分隔：身體照顧、家務服務、管路照護、復能訓練',
          value: w ? skillNames(w.skills) : '身體照顧' },
        { key: 'personality', label: '性格標籤', hint: '目前僅儲存，交由 LLM 處理，不計入罰分',
          value: w ? (w.personality || []).join('、') : '' },
        { key: 'start', label: '可出勤起', value: w ? fmt(w.available.start) : '08:00' },
        { key: 'end', label: '可出勤迄', value: w ? fmt(w.available.end) : '17:00' },
        { key: 'onDuty', label: '今日出勤', type: 'select', value: w ? (w.onDuty === false ? '0' : '1') : '1',
          options: [{ v: '1', t: '出勤' }, { v: '0', t: '請假／未出勤' }] },
      ], (f) => {
        const rev = {}; Object.keys(data.SKILL_LABEL).forEach((k) => { rev[data.SKILL_LABEL[k]] = k; });
        const skills = f.skills.split(/[、,，\s]+/).filter(Boolean).map((s) => rev[s] || s);
        const target = w || {
          id: 'W' + String(data.caregivers.length + 1).padStart(3, '0'),
          home: { x: 2000, y: 2000 }, restDays: [0],
        };
        Object.assign(target, {
          name: f.name || '新員工', title: f.title, gender: f.gender, payType: f.payType,
          payRate: Number(f.payRate) || 0,
          splitRatio: f.payType === 'split' ? Number(f.splitRatio) || 0.6 : null,
          skills, personality: f.personality.split(/[、,，\s]+/).filter(Boolean),
          available: { start: parseTime(f.start) ?? 480, end: parseTime(f.end) ?? 1020 },
          onDuty: f.onDuty === '1',
        });
        if (!w) data.caregivers.push(target);
      });

    } else if (kind === 'client') {
      const c = id ? data.clients.find((x) => x.id === id) : null;
      const cgOpts = [{ v: '', t: '（無）' }].concat(data.caregivers.map((w) => ({ v: w.id, t: w.name })));
      openModal(c ? '修改服務個案' : '新增服務個案', [
        { key: 'name', label: '姓名', value: c ? c.name : '' },
        { key: 'address', label: '地址', value: c ? c.address : '' },
        { key: 'phone', label: '連絡電話', value: c ? c.phone : '' },
        { key: 'careLevel', label: '長照等級', type: 'select', value: c ? c.careLevel : 4,
          options: [2, 3, 4, 5, 6, 7, 8].map((n) => ({ v: n, t: '第 ' + n + ' 級' })) },
        { key: 'skills', label: '需求技能', hint: '以頓號分隔', value: c ? skillNames(c.requiredSkills) : '身體照顧' },
        { key: 'gender', label: '性別需求', type: 'select', value: c ? (c.requiredGender || '') : '',
          options: [{ v: '', t: '不限' }, { v: 'F', t: '限女性' }, { v: 'M', t: '限男性' }] },
        { key: 'needs', label: '特殊需求（自由文字）', hint: '正式版由 LLM 前處理轉為結構化約束',
          value: c ? c.specialNeeds : '' },
        { key: 'designated', label: '指定居服員', type: 'select',
          value: c && c.designatedCaregivers[0] ? c.designatedCaregivers[0] : '', options: cgOpts },
        { key: 'excluded', label: '排除居服員', type: 'select',
          value: c && c.excludedCaregivers[0] ? c.excludedCaregivers[0] : '', options: cgOpts },
        { key: 'last', label: '前次居服員', type: 'select', value: c ? (c.lastServedBy || '') : '', options: cgOpts },
        { key: 'x', label: '座標 X（公尺）', value: c ? c.pos.x : 2000 },
        { key: 'y', label: '座標 Y（公尺）', value: c ? c.pos.y : 2000 },
      ], (f) => {
        const rev = {}; Object.keys(data.SKILL_LABEL).forEach((k) => { rev[data.SKILL_LABEL[k]] = k; });
        const target = c || { id: 'C' + String(data.clients.length + 1).padStart(3, '0'), family: {} };
        Object.assign(target, {
          name: f.name || '新個案', address: f.address, phone: f.phone,
          careLevel: Number(f.careLevel),
          requiredSkills: f.skills.split(/[、,，\s]+/).filter(Boolean).map((s) => rev[s] || s),
          requiredGender: f.gender || null,
          specialNeeds: f.needs,
          designatedCaregivers: f.designated ? [f.designated] : [],
          excludedCaregivers: f.excluded ? [f.excluded] : [],
          lastServedBy: f.last || null,
          pos: { x: Number(f.x) || 0, y: Number(f.y) || 0 },
        });
        if (!c) data.clients.push(target);
        // 個案等級改變時重算收費
        data.cases.filter((k) => k.clientId === target.id).forEach((k) => {
          k.revenue = data.PARAMS.revenue[k.serviceType][target.careLevel];
        });
      });

    } else {
      const k = id ? data.cases.find((x) => x.id === id) : null;
      openModal(k ? '修改案件' : '新增案件', [
        { key: 'clientId', label: '服務個案', type: 'select', value: k ? k.clientId : data.clients[0].id,
          options: data.clients.map((c) => ({ v: c.id, t: c.name + '（第 ' + c.careLevel + ' 級）' })) },
        { key: 'serviceType', label: '服務類型', type: 'select', value: k ? k.serviceType : 'mid',
          options: [{ v: 'short', t: '短時（30 分）' }, { v: 'mid', t: '中時（45 分）' }, { v: 'long', t: '長時（60 分）' }] },
        { key: 'earliest', label: '最早可開始', value: k ? fmt(k.window.earliest) : '09:00' },
        { key: 'latest', label: '最晚可開始', value: k ? fmt(k.window.latest) : '09:30' },
        { key: 'duration', label: '服務時長（分鐘）', value: k ? k.duration : 45 },
      ], (f) => {
        const cl = data.clients.find((c) => c.id === f.clientId);
        const target = k || {
          id: data.DATE.replace(/-/g, '') + '-' + String(data.cases.length + 1).padStart(3, '0'),
          date: data.DATE, actual: { arrivedAt: null, finishedAt: null },
        };
        Object.assign(target, {
          clientId: f.clientId, serviceType: f.serviceType,
          window: { earliest: parseTime(f.earliest) ?? 540, latest: parseTime(f.latest) ?? 570 },
          duration: Number(f.duration) || 90,
          revenue: data.PARAMS.revenue[f.serviceType][cl.careLevel],
          assignedTo: null,
        });
        if (!k) data.cases.push(target);
      });
    }
  }

  /* ----------------------------------------------------------- AI 對話 */

  function say(who, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
  }

  function summaryLine() {
    const m = state.metrics;
    return `毛利 $${money(m.profit)}／目標值 ${m.fitness.toFixed(3)}／`
      + `壓力不均 ${m.pFair.toFixed(3)}／已排入 ${m.assigned} 件`;
  }

  function handleChat(text) {
    const t = text.trim();
    if (!t) return;
    say('me', t);
    if (state.solving) { say('ai', '排班計算進行中，請待計算完成後再下指令。'); return; }
    if (!state.solution) { say('ai', '尚未產生排班結果，請稍候或按「重新排班」。'); return; }
    const before = Object.assign({}, state.metrics);

    // 1) 請假／復工
    const leave = /(請假|休假|不能出勤|臨時有事)/.test(t);
    const back = /(復工|回來上班|可以出勤|銷假)/.test(t);
    const who = data.caregivers.find((w) => t.indexOf(w.name) >= 0 || t.toUpperCase().indexOf(w.id) >= 0);
    if ((leave || back) && who) {
      who.onDuty = !leave;
      say('ai', `已將「${who.name}」設為${leave ? '今日未出勤' : '可出勤'}，正在觸發局部重排…`);
      solve(() => {
        const m = state.metrics;
        let msg = `重排完成。${summaryLine()}`;
        if (before) {
          const d = m.profit - before.profit;
          msg += `\n毛利變化 ${signed(d)}`;
          if (m.unassigned > before.unassigned) {
            msg += `\n⚠ 有 ${m.unassigned - before.unassigned} 件案件因此無法排入，建議協調時段或加派人力。`;
          }
        }
        say('ai', msg);
      });
      return;
    }
    if ((leave || back) && !who) { say('ai', '找不到這位居服員，請提供姓名或員工編號（例如「王淑芬請假」）。'); return; }

    // 2) 調整取捨
    if (/(公平|平均|太累|過勞|負擔)/.test(t)) {
      state.weights.theta = Math.min(1, +(state.weights.theta + 0.2).toFixed(2));
      syncWeightUI();
      say('ai', `已將 θ 提高至 ${state.weights.theta.toFixed(2)}（更重視員工公平與個案偏好），重新求解中…`);
      solve(() => say('ai', `完成。${summaryLine()}\n壓力不均由 ${before.pFair.toFixed(3)} 變為 ${state.metrics.pFair.toFixed(3)}，`
        + `毛利變化 ${signed(state.metrics.profit - before.profit)}。`));
      return;
    }
    if (/(毛利|獲利|營收|成本|效益|產值|賺)/.test(t)) {
      state.weights.theta = Math.max(0, +(state.weights.theta - 0.2).toFixed(2));
      syncWeightUI();
      say('ai', `已將 θ 降低至 ${state.weights.theta.toFixed(2)}（更重視營運毛利），重新求解中…`);
      solve(() => say('ai', `完成。${summaryLine()}\n毛利變化 ${signed(state.metrics.profit - before.profit)}，`
        + `壓力不均由 ${before.pFair.toFixed(3)} 變為 ${state.metrics.pFair.toFixed(3)}。`));
      return;
    }

    // 3) 未排入原因
    if (/(未排入|沒排|排不進|無法排|為什麼)/.test(t)) {
      const un = state.solution.unassigned;
      if (!un.length) { say('ai', `目前 ${data.cases.length} 件案件全部排入，無未排入案件。${summaryLine()}`); return; }
      const lines = un.map((cid) => {
        const k = state.ctx.caseById[cid];
        const cl = state.ctx.clientById[k.clientId];
        return `【${cl.name}　${fmt(k.window.earliest)}–${fmt(k.window.latest)}　${k.duration} 分】\n`
          + explainUnassigned(cid).map((s) => '　· ' + s).join('\n');
      });
      say('ai', `有 ${un.length} 件案件未排入：\n\n` + lines.join('\n\n'));
      return;
    }

    // 4) 重排
    if (/(重排|重新排班|再算|重算)/.test(t)) {
      say('ai', '重新求解中…');
      solve(() => say('ai', `完成。${summaryLine()}`));
      return;
    }

    // 5) 說明目前結果
    if (/(狀況|現況|摘要|報告|如何|怎麼樣)/.test(t)) {
      const m = state.metrics;
      const busiest = data.caregivers
        .map((w) => ({ w, S: state.routeOf[w.id] ? state.routeOf[w.id].stress.S : 0 }))
        .sort((a, b) => b.S - a.S)[0];
      say('ai', `今日 ${data.cases.length} 件案件，已排入 ${m.assigned} 件。\n`
        + `服務收入 $${money(m.revenue)}，人力成本 $${money(m.laborCost)}，交通 $${money(m.travelCost)}，毛利 $${money(m.profit)}。\n`
        + `壓力最高者為 ${busiest.w.name}（${busiest.S.toFixed(2)}）。\n`
        + `罰分：公平 ${m.pFair.toFixed(3)}／偏好 ${m.pPref.toFixed(3)}／空班 ${m.pIdle.toFixed(3)}。`);
      return;
    }

    say('ai', '目前為規則式模擬（正式版接 LLM）。可以試試：\n'
      + '· 「王淑芬請假」— 觸發動態重排\n'
      + '· 「提高公平性」／「以毛利為優先」— 調整權重 θ\n'
      + '· 「為什麼有案件沒排入」— 未排入原因分析\n'
      + '· 「今天狀況如何」— 營運摘要');
  }

  /* ------------------------------------------------------------- 綁定 */

  function syncWeightUI() {
    $('theta').value = state.weights.theta;
    $('valTheta').textContent = state.weights.theta.toFixed(2);
    const L = state.weights.lambda;
    $('valL1').textContent = L[0].toFixed(2);
    $('valL2').textContent = L[1].toFixed(2);
    $('valL3').textContent = L[2].toFixed(2);
    const th = state.weights.theta;
    $('thetaHint').textContent = th <= 0.15 ? '幾乎完全以營運毛利為目標'
      : th >= 0.85 ? '幾乎完全以員工公平與個案偏好為目標'
      : `願意放棄約 ${Math.round(th * 100)}% 的毛利權重，換取更公平的排班`;
  }

  function readLambda() {
    const raw = [Number($('l1').value), Number($('l2').value), Number($('l3').value)];
    const sum = raw.reduce((a, b) => a + b, 0);
    state.weights.lambda = sum > 0 ? raw.map((v) => v / sum) : [1 / 3, 1 / 3, 1 / 3];
  }

  function render() {
    renderKPI();
    renderStress();
    renderGantt();
    renderMap();
    renderTable();
  }

  function bind() {
    $('dateLabel').textContent = data.DATE;
    $('btnSolve').addEventListener('click', () => solve());

    $('theta').addEventListener('input', () => {
      state.weights.theta = Number($('theta').value); syncWeightUI();
    });
    $('theta').addEventListener('change', () => solve());

    ['l1', 'l2', 'l3'].forEach((id) => {
      $(id).addEventListener('input', () => { readLambda(); syncWeightUI(); });
      $(id).addEventListener('change', () => solve());
    });

    $('nowSlider').addEventListener('input', () => {
      state.now = Number($('nowSlider').value);
      $('nowLabel').textContent = fmt(state.now);
      positionNowLine();
      renderMap();
      if (state.tab === 'duty') renderTable();
    });

    $('showRoutes').addEventListener('change', () => {
      state.showRoutes = $('showRoutes').checked; renderMap();
    });

    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.tab = b.dataset.tab;
      $('tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      renderTable();
    });

    $('btnAdd').addEventListener('click', () => {
      openEditor(state.tab === 'staff' ? 'staff' : state.tab === 'clients' ? 'client' : 'case', null);
    });

    $('modalCancel').addEventListener('click', closeModal);
    $('modalBackdrop').addEventListener('click', (e) => { if (e.target === $('modalBackdrop')) closeModal(); });
    $('modalSave').addEventListener('click', () => {
      const f = readModal();
      closeModal();
      if (modal.onSave) modal.onSave(f);
      solve();
    });

    $('btnSend').addEventListener('click', () => { handleChat($('chatText').value); $('chatText').value = ''; });
    $('chatText').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { handleChat($('chatText').value); $('chatText').value = ''; }
    });

    const quick = ['王淑芬請假', '提高公平性', '以毛利為優先', '為什麼有案件沒排入', '今天狀況如何'];
    $('chatQuick').innerHTML = quick.map((q) => `<button>${esc(q)}</button>`).join('');
    $('chatQuick').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (b) handleChat(b.textContent);
    });

    window.addEventListener('resize', positionNowLine);
  }

  /* --------------------------------------------------------------- 啟動 */

  bind();
  syncWeightUI();
  $('nowLabel').textContent = fmt(state.now);
  solve(() => {
    say('sys', '規則式模擬助理已就緒');
    say('ai', `今日 ${data.cases.length} 件案件已完成初次排班。${summaryLine()}\n`
      + '可輸入指令調整，例如「王淑芬請假」或「提高公平性」。');
  });
})();
