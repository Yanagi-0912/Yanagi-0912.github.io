/* ==========================================================================
   solver.js —— 排班求解器（Genetic Algorithm）
   對應「居服員排班演算法.md」§2 剪枝 / §3 目標函數 / §5 GA 設計

   染色體 = 當日所有案件的一個排列（giant tour）
   解碼   = 依排列順序，將案件插入邊際成本最低且可行的居服員路線
   適應度 = F = (1 − θ)·Π_norm − θ·P − ρ·(未排入比例)
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- 幾何 */

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // τ(i,j) = 歐氏距離 ÷ 平均車速，無條件進位至 5 分鐘
  function travelTime(meters, PARAMS) {
    return Math.ceil(meters / PARAMS.speed / 5) * 5;
  }

  /* ------------------------------------------------------------ 求解情境 */

  function makeContext(data) {
    const { PARAMS, caregivers, clients, cases } = data;

    const clientById = {}; clients.forEach((c) => { clientById[c.id] = c; });
    const caregiverById = {}; caregivers.forEach((w) => { caregiverById[w.id] = w; });
    const caseById = {}; cases.forEach((c) => { caseById[c.id] = c; });

    const posOf = (caseId) => clientById[caseById[caseId].clientId].pos;

    // §2 轉場時間矩陣（同時作為可行邊剪枝的依據）
    const tau = {}, meters = {};
    cases.forEach((a) => {
      tau[a.id] = {}; meters[a.id] = {};
      cases.forEach((b) => {
        const m = dist(posOf(a.id), posOf(b.id));
        meters[a.id][b.id] = m;
        tau[a.id][b.id] = travelTime(m, PARAMS);
      });
    });

    // §2 可行邊剪枝：e_i + d_i + τ(i,j) ≤ l_j
    let edges = 0;
    const feasibleEdge = {};
    cases.forEach((a) => {
      feasibleEdge[a.id] = {};
      cases.forEach((b) => {
        if (a.id === b.id) { feasibleEdge[a.id][b.id] = false; return; }
        const ok = a.window.earliest + a.duration + tau[a.id][b.id] <= b.window.latest;
        feasibleEdge[a.id][b.id] = ok;
        if (ok) edges += 1;
      });
    });

    const onDuty = caregivers.filter((w) => w.onDuty !== false);

    return {
      PARAMS, caregivers, clients, cases, clientById, caregiverById, caseById,
      posOf, tau, meters, feasibleEdge, onDuty,
      pruning: { total: cases.length * (cases.length - 1), kept: edges },
      piRef: cases.reduce((s, c) => s + c.revenue, 0) || 1,
    };
  }

  /* ---------------------------------------------------------------- 約束 */

  // 硬約束：排除名單、性別需求、技能需求
  function eligible(w, kase, ctx) {
    const cl = ctx.clientById[kase.clientId];
    if (cl.excludedCaregivers.indexOf(w.id) >= 0) return false;
    if (cl.requiredGender && cl.requiredGender !== w.gender) return false;
    for (let i = 0; i < cl.requiredSkills.length; i++) {
      if (w.skills.indexOf(cl.requiredSkills[i]) < 0) return false;
    }
    return true;
  }

  // 軟約束：偏好違反分（基本設計.md → 罰分 → 偏好違反分）
  function prefViolation(kase, wId, ctx) {
    const cl = ctx.clientById[kase.clientId];
    const P = ctx.PARAMS.prefPenalty;
    if (cl.designatedCaregivers.length) {
      return cl.designatedCaregivers.indexOf(wId) >= 0 ? 0 : P.designatedMissed;
    }
    if (cl.lastServedBy) {
      return cl.lastServedBy === wId ? 0 : P.continuityBroken;
    }
    return 0;
  }

  /* ------------------------------------------------------ 單條路線的時序 */

  /**
   * 依序推算一條路線的時間軸，不可行則回傳 null。
   * 首末段通勤不計費、不計工時，故時間軸自第一個案件開始。
   */
  function computeRoute(w, seq, ctx) {
    const P = ctx.PARAMS;
    if (!seq.length) return null;

    const stops = [];
    let prev = null, work = 0, meters = 0, cont = 0, maxCont = 0, load = 0;

    for (let k = 0; k < seq.length; k++) {
      const kase = ctx.caseById[seq[k]];
      const cl = ctx.clientById[kase.clientId];

      const travel = prev ? ctx.tau[prev.id][kase.id] : 0;
      const meterAdd = prev ? ctx.meters[prev.id][kase.id] : 0;
      const readyAt = prev ? prev.end + travel : w.available.start;

      let start = Math.max(readyAt, kase.window.earliest);

      // 連續工時上限為硬約束：若加入本案會超過 T_c，先安排一段法定休息
      if (prev && cont + travel + kase.duration > P.T_c) {
        start = Math.max(start, prev.end + travel + P.restThreshold);
      }
      if (start > kase.window.latest) return null;          // 時間窗不可行
      if (start < w.available.start) return null;           // 早於可出勤時段

      const end = start + kase.duration;
      if (end > w.available.end) return null;               // 晚於可出勤時段

      const gap = prev ? start - (prev.end + travel) : 0;    // 空班（等待／休息）

      cont += travel;
      if (gap >= P.restThreshold) cont = 0;                  // 空班達門檻視為休息
      cont += kase.duration;
      if (cont > P.T_c) return null;                         // 連續工時違法
      maxCont = Math.max(maxCont, cont);

      work += travel + kase.duration;                        // 工時 = 服務 + 轉場
      if (work > P.H_max) return null;                       // 超過當日工時上限

      meters += meterAdd;
      load += P.omega[cl.careLevel] * kase.duration;

      stops.push({
        caseId: kase.id, start, end,
        travelFromPrev: travel, gap, isRest: gap >= P.restThreshold,
      });
      prev = { id: kase.id, end };
    }

    const firstStart = stops[0].start;
    const lastEnd = stops[stops.length - 1].end;
    const span = lastEnd - firstStart;
    const idle = span - work;

    const U = work / P.H_max;
    const L = load / (P.omegaMax * P.H_max);
    const C = maxCont / P.T_c;
    const S = P.alpha[0] * U + P.alpha[1] * L + P.alpha[2] * C;

    const revenue = seq.reduce((s, id) => s + ctx.caseById[id].revenue, 0);
    let cost = 0;
    if (w.payType === 'monthly') cost = w.payRate / P.workDaysPerMonth;
    else if (w.payType === 'hourly') cost = w.payRate * (work / 60);
    else if (w.payType === 'split') cost = w.splitRatio * revenue;

    return {
      caregiverId: w.id, stops,
      workMinutes: work, spanMinutes: span, idleMinutes: idle,
      maxContinuous: maxCont, meters,
      firstStart, lastEnd, revenue, cost,
      stress: { U, L, C, S },
    };
  }

  /* ------------------------------------------------------------ 解碼器 */

  function baseCost(w, ctx) {
    // 未排入任何案件時的當日成本：月薪為沉沒成本，仍需支付
    if (w.payType === 'monthly') return w.payRate / ctx.PARAMS.workDaysPerMonth;
    return 0;
  }

  /**
   * 將排列解碼為排班方案。
   * 依序取出案件，於所有合格居服員的所有插入位置中，
   * 挑選「邊際目標值」最佳者；皆不可行則列入未排入。
   */
  function decode(order, ctx, weights) {
    const theta = weights.theta, lambda = weights.lambda;
    const avgRevenue = ctx.piRef / ctx.cases.length;

    const seqOf = {}, infoOf = {};
    ctx.onDuty.forEach((w) => { seqOf[w.id] = []; infoOf[w.id] = null; });

    const unassigned = [];

    for (let n = 0; n < order.length; n++) {
      const cid = order[n];
      const kase = ctx.caseById[cid];
      let best = null;

      for (let i = 0; i < ctx.onDuty.length; i++) {
        const w = ctx.onDuty[i];
        if (!eligible(w, kase, ctx)) continue;

        const seq = seqOf[w.id];
        for (let pos = 0; pos <= seq.length; pos++) {
          const trial = seq.slice();
          trial.splice(pos, 0, cid);
          const r = computeRoute(w, trial, ctx);
          if (!r) continue;

          const cur = infoOf[w.id];
          const prevCost = cur ? cur.cost : baseCost(w, ctx);
          const prevMeters = cur ? cur.meters : 0;
          const prevIdle = cur ? cur.idleMinutes : 0;

          const moneyDelta = (r.cost - prevCost)
            + (r.meters - prevMeters) * ctx.PARAMS.travelCostPerMeter;
          const idleDelta = r.idleMinutes - prevIdle;

          const score = (1 - theta) * (moneyDelta / avgRevenue)
            + theta * (lambda[0] * r.stress.S
              + lambda[1] * prefViolation(kase, w.id, ctx)
              + lambda[2] * Math.min(1, idleDelta / 120));

          if (!best || score < best.score) best = { score, wId: w.id, trial, route: r };
        }
      }

      if (best) { seqOf[best.wId] = best.trial; infoOf[best.wId] = best.route; }
      else unassigned.push(cid);
    }

    const routes = ctx.onDuty.map((w) => infoOf[w.id]).filter(Boolean);
    return { routes, unassigned };
  }

  /* -------------------------------------------------------- 目標函數 */

  function std(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
    return Math.sqrt(v);
  }

  function evaluate(sol, ctx, weights) {
    const P = ctx.PARAMS;
    const theta = weights.theta, lambda = weights.lambda;

    const routeOf = {};
    sol.routes.forEach((r) => { routeOf[r.caregiverId] = r; });

    let revenue = 0, laborCost = 0, travelCost = 0;
    const stresses = [];
    let idleSum = 0, spanSum = 0, workSum = 0;

    // 成本涵蓋所有居服員：月薪即使當日請假仍需支付，屬沉沒成本；
    // 公平性只比較「今日出勤者」，未出勤者不納入壓力指數的分布。
    ctx.caregivers.forEach((w) => {
      const r = routeOf[w.id];
      if (r) {
        revenue += r.revenue;
        laborCost += r.cost;
        travelCost += r.meters * P.travelCostPerMeter;
        idleSum += r.idleMinutes;
        spanSum += r.spanMinutes;
        workSum += r.workMinutes;
        stresses.push(r.stress.S);
      } else {
        laborCost += baseCost(w, ctx);
        if (w.onDuty !== false) stresses.push(0);
      }
    });

    const profit = revenue - laborCost - travelCost;
    const piNorm = profit / ctx.piRef;

    // P_fair：壓力指數標準差 ÷ 0.5（0~1 區間標準差的理論最大值）
    const pFair = Math.min(1, std(stresses) / 0.5);

    // P_pref：偏好違反分總和 ÷ 當日案件數
    let violation = 0;
    sol.routes.forEach((r) => {
      r.stops.forEach((s) => {
        violation += prefViolation(ctx.caseById[s.caseId], r.caregiverId, ctx);
      });
    });
    const pPref = ctx.cases.length ? violation / ctx.cases.length : 0;

    // P_idle：空班分鐘總和 ÷ 在勤時間總和
    const pIdle = spanSum ? idleSum / spanSum : 0;

    const penalty = lambda[0] * pFair + lambda[1] * pPref + lambda[2] * pIdle;
    const unassignedRatio = ctx.cases.length ? sol.unassigned.length / ctx.cases.length : 0;
    const fitness = (1 - theta) * piNorm - theta * penalty - P.rho * unassignedRatio;

    return {
      revenue, laborCost, travelCost, profit, piNorm,
      pFair, pPref, pIdle, penalty, fitness,
      unassigned: sol.unassigned.length,
      workSum, idleSum, spanSum,
      assigned: ctx.cases.length - sol.unassigned.length,
    };
  }

  /* ------------------------------------------------------------- GA */

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Order Crossover (OX)
  function crossoverOX(p1, p2, rand) {
    const n = p1.length;
    let a = Math.floor(rand() * n), b = Math.floor(rand() * n);
    if (a > b) { const t = a; a = b; b = t; }
    const child = new Array(n).fill(null);
    const taken = {};
    for (let i = a; i <= b; i++) { child[i] = p1[i]; taken[p1[i]] = true; }
    let k = (b + 1) % n;
    for (let i = 0; i < n; i++) {
      const g = p2[(b + 1 + i) % n];
      if (!taken[g]) { child[k] = g; k = (k + 1) % n; }
    }
    return child;
  }

  function mutate(order, rand) {
    const a = order.slice();
    const n = a.length;
    if (n < 2) return a;
    if (rand() < 0.5) {                       // swap
      const i = Math.floor(rand() * n), j = Math.floor(rand() * n);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    } else {                                  // insert
      const i = Math.floor(rand() * n);
      const g = a.splice(i, 1)[0];
      a.splice(Math.floor(rand() * (n - 1)), 0, g);
    }
    return a;
  }

  function seedOrders(ctx) {
    const ids = ctx.cases.map((c) => c.id);
    const by = (fn) => ids.slice().sort(fn);
    const C = ctx.caseById, CL = ctx.clientById;
    return [
      by((a, b) => C[a].window.earliest - C[b].window.earliest),          // 時間窗最早優先
      by((a, b) => CL[C[b].clientId].careLevel - CL[C[a].clientId].careLevel), // 長照等級高優先
      by((a, b) => C[b].duration - C[a].duration),                        // 服務時長長優先
      by((a, b) => (C[a].window.latest - C[a].window.earliest)
        - (C[b].window.latest - C[b].window.earliest)),                    // 時間窗最緊優先
    ];
  }

  /**
   * 建立求解器。solver.step(n) 執行 n 代，可分批呼叫以免凍結畫面。
   * （正式版建議改置於 Web Worker）
   */
  function createSolver(ctx, weights, opts) {
    const o = Object.assign(
      { popSize: 60, elite: 4, generations: 200, mutationRate: 0.25, localSearch: 12 },
      opts || {}
    );
    const rand = Math.random;
    const ids = ctx.cases.map((c) => c.id);

    const scoreOf = (order) => {
      const sol = decode(order, ctx, weights);
      const m = evaluate(sol, ctx, weights);
      return { order, sol, metrics: m, fitness: m.fitness };
    };

    let pop = seedOrders(ctx).map(scoreOf);
    while (pop.length < o.popSize) pop.push(scoreOf(shuffle(ids, rand)));
    pop.sort((a, b) => b.fitness - a.fitness);

    let generation = 0;
    const history = [pop[0].fitness];

    function pick() {
      let best = null;
      for (let i = 0; i < 3; i++) {
        const c = pop[Math.floor(rand() * pop.length)];
        if (!best || c.fitness > best.fitness) best = c;
      }
      return best;
    }

    function localSearch(ind) {
      let cur = ind;
      for (let i = 0; i < o.localSearch; i++) {
        const cand = scoreOf(mutate(cur.order, rand));
        if (cand.fitness > cur.fitness) cur = cand;
      }
      return cur;
    }

    function step(n) {
      for (let g = 0; g < n && generation < o.generations; g++) {
        const next = pop.slice(0, o.elite);
        while (next.length < o.popSize) {
          let child = crossoverOX(pick().order, pick().order, rand);
          if (rand() < o.mutationRate) child = mutate(child, rand);
          next.push(scoreOf(child));
        }
        next.sort((a, b) => b.fitness - a.fitness);
        next[0] = localSearch(next[0]);
        next.sort((a, b) => b.fitness - a.fitness);
        pop = next;
        generation += 1;
        history.push(pop[0].fitness);
      }
      return { generation, done: generation >= o.generations, best: pop[0], history };
    }

    return {
      step,
      get generation() { return generation; },
      get best() { return pop[0]; },
      get history() { return history; },
      totalGenerations: o.generations,
    };
  }

  /* --------------------------------------------------------------- 匯出 */

  const SOLVER = {
    dist, travelTime, makeContext, eligible, prefViolation,
    computeRoute, decode, evaluate, createSolver, std,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SOLVER;
  else global.SOLVER = SOLVER;
})(typeof window !== 'undefined' ? window : globalThis);
