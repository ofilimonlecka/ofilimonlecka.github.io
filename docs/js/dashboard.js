/* Supertab Connect dashboard — main chart, KPIs, agents table (period-aware) */
(function () {
  "use strict";
  const D = window.DASHBOARD_DATA;
  const fmt = (n) => n.toLocaleString("en-US");
  const el = (id) => document.getElementById(id);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const argmax = (a) => { let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i; return m; };

  window.DashState = { period: 30 };
  let currentView;

  // ---- View slicing -------------------------------------------------------
  function computeView(period) {
    const dates = D.dates.slice(-period);
    const agents = D.agents.map((a) => {
      const daily = a.daily.slice(-period);
      const total = sum(daily);
      return {
        ref: a, id: a.id, name: a.name, ua: a.ua, color: a.color,
        category: a.category, categoryLabel: a.categoryLabel, lastSeen: a.lastSeen,
        pagesVisited: a.pagesVisited, daily, total, topDay: dates[argmax(daily)].label,
      };
    });
    const categorySeries = D.categorySeries.map((c) => {
      const daily = c.daily.slice(-period);
      return { key: c.key, label: c.label, color: c.color, daily, total: sum(daily) };
    });
    const grandDaily = dates.map((_, i) => sum(categorySeries.map((c) => c.daily[i])));
    return { period, dates, agents, categorySeries, grandDaily, grandTotal: sum(grandDaily) };
  }

  // ---- KPI row ------------------------------------------------------------
  function pctChange(period) {
    const g = D.grandDaily, len = g.length;
    let cur = sum(g.slice(len - period)), prev;
    if (len >= 2 * period) {
      prev = sum(g.slice(len - 2 * period, len - period));
    } else {
      const w = g.slice(len - period), h = Math.floor(w.length / 2);
      prev = sum(w.slice(0, h)); cur = sum(w.slice(h));
    }
    return prev ? ((cur - prev) / prev) * 100 : 0;
  }
  function renderKpis(view) {
    const aiKeys = ["ai_training", "ai_assistant", "ai_search", "ai_agent"];
    const aiTotal = view.categorySeries.filter((c) => aiKeys.includes(c.key)).reduce((a, c) => a + c.total, 0);
    const spoofed = view.categorySeries.find((c) => c.key === "spoofed").total;
    const change = pctChange(view.period);
    const cls = change >= 0 ? "up" : "down", arrow = change >= 0 ? "▲" : "▼";
    const active = view.agents.filter((a) => a.total > 0).length;
    const T = view.grandTotal || 1;
    const cards = [
      { label: "Total Visits", value: fmt(view.grandTotal), sub: `<span class="${cls}">${arrow} ${Math.abs(change).toFixed(1)}%</span> vs. previous period` },
      { label: "AI-related", value: fmt(aiTotal), sub: `${((aiTotal / T) * 100).toFixed(1)}% of all traffic` },
      { label: "Spoofed", value: fmt(spoofed), sub: `${((spoofed / T) * 100).toFixed(1)}% of all traffic` },
      { label: "Agents Tracked", value: fmt(active), sub: `across ${D.categories.length} categories` },
    ];
    el("kpi-row").innerHTML = cards.map((c) => `
      <div class="kpi">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`).join("");
  }

  // ---- Legend + main chart ------------------------------------------------
  const hidden = new Set();
  let mainChart;

  function renderLegend() {
    el("legend").innerHTML = D.categorySeries.map((c) => `
      <span class="legend-chip" data-key="${c.key}">
        <span class="dot" style="background:${c.color}"></span>${c.label}
      </span>`).join("");
    el("legend").querySelectorAll(".legend-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.key, label = D.categoryByKey[key].label;
        if (hidden.has(key)) { hidden.delete(key); chip.classList.remove("off"); }
        else { hidden.add(key); chip.classList.add("off"); }
        mainChart.dispatchAction({ type: "legendToggleSelect", name: label });
        updateToggleAllBtn();
      });
    });
  }
  function updateToggleAllBtn() {
    const btn = el("toggle-all"), allOn = hidden.size === 0;
    btn.textContent = allOn ? "Hide all" : "Show all";
    btn.classList.toggle("on", !allOn);
  }

  function xInterval(period) { return period <= 7 ? 0 : period <= 14 ? 1 : 3; }

  function initMainChart(view) {
    mainChart = echarts.init(el("main-chart"));
    mainChart.setOption({
      color: D.categorySeries.map((c) => c.color),
      grid: { left: 54, right: 22, top: 16, bottom: 34 },
      legend: { show: false, data: D.categorySeries.map((c) => c.label) },
      tooltip: {
        trigger: "axis", backgroundColor: "#fff", borderColor: "#e8eaed", borderWidth: 1, padding: 0,
        extraCssText: "box-shadow:0 12px 40px rgba(16,24,40,.16);border-radius:12px;",
        formatter: function (params) {
          if (!params.length) return "";
          const idx = params[0].dataIndex;
          const total = params.reduce((a, p) => a + (p.value || 0), 0);
          const rows = params.slice().sort((a, b) => (b.value || 0) - (a.value || 0)).map((p) => `
              <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
                <span style="width:9px;height:9px;border-radius:50%;background:${p.color};"></span>
                <span style="color:#374151;flex:1;">${p.seriesName}</span>
                <span style="font-weight:700;font-variant-numeric:tabular-nums;">${fmt(p.value || 0)}</span>
              </div>`).join("");
          return `<div style="padding:12px 14px;min-width:230px;">
              <div style="font-weight:650;font-size:13px;">${currentView.dates[idx].long}</div>
              <div style="color:#6b7280;font-size:12.5px;margin:2px 0 8px;">Total visits: <b style="color:#1a1d21;">${fmt(total)}</b></div>
              ${rows}</div>`;
        },
      },
      xAxis: {
        type: "category", boundaryGap: false, data: view.dates.map((d) => d.label),
        axisLine: { lineStyle: { color: "#e8eaed" } }, axisTick: { show: false },
        axisLabel: { color: "#9aa1ab", interval: xInterval(view.period), fontSize: 11 },
      },
      yAxis: {
        type: "value", splitLine: { lineStyle: { color: "#f0f1f4", type: "dashed" } },
        axisLabel: { color: "#9aa1ab", fontSize: 11, formatter: (v) => (v >= 1000 ? v / 1000 + "k" : v) },
      },
      series: D.categorySeries.map((c, i) => ({
        name: c.label, type: "line", stack: "total", smooth: 0.4, symbol: "none",
        lineStyle: { width: 1.2, color: c.color }, areaStyle: { color: c.color, opacity: 0.55 },
        emphasis: { focus: "series" }, data: view.categorySeries[i].daily,
      })),
    });
    window.addEventListener("resize", () => mainChart.resize());
  }
  function updateMainChart(view) {
    mainChart.setOption({
      xAxis: { data: view.dates.map((d) => d.label), axisLabel: { interval: xInterval(view.period) } },
      series: view.categorySeries.map((c) => ({ name: c.label, data: c.daily })),
    });
  }

  el("toggle-all").addEventListener("click", () => {
    if (hidden.size === 0) {
      D.categorySeries.forEach((c) => { hidden.add(c.key); mainChart.dispatchAction({ type: "legendUnSelect", name: c.label }); });
    } else {
      hidden.clear();
      D.categorySeries.forEach((c) => mainChart.dispatchAction({ type: "legendSelect", name: c.label }));
    }
    el("legend").querySelectorAll(".legend-chip").forEach((chip) => chip.classList.toggle("off", hidden.has(chip.dataset.key)));
    updateToggleAllBtn();
  });

  // ---- Sparkline ----------------------------------------------------------
  function sparkline(daily, color) {
    const w = 96, h = 26, pad = 2, max = Math.max(...daily, 1);
    const step = (w - pad * 2) / Math.max(1, daily.length - 1);
    const pts = daily.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${(w - pad).toFixed(1)} ${h} L${pad} ${h} Z`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path d="${area}" fill="${color}" opacity="0.13"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
  }

  // ---- Agents table -------------------------------------------------------
  let sortKey = "total", sortDir = -1, filterText = "";
  function renderTable(view) {
    const rows = view.agents
      .filter((a) => !filterText || a.name.toLowerCase().includes(filterText) || a.categoryLabel.toLowerCase().includes(filterText))
      .sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
    el("agents-body").innerHTML = rows.map((a) => `
      <tr data-id="${a.id}">
        <td class="col-name">
          <div class="agent-name">
            <span class="dot" style="width:9px;height:9px;border-radius:50%;background:${a.color}"></span>
            <div><div class="n-main">${a.name}</div><div class="n-ua">${a.ua}</div></div>
          </div>
        </td>
        <td class="col-cat"><span class="cat-badge"><span class="dot" style="background:${a.color}"></span>${a.categoryLabel}</span></td>
        <td class="col-num">${fmt(a.total)}</td>
        <td class="col-num col-pages">${a.pagesVisited}</td>
        <td class="col-trend">${sparkline(a.daily, a.color)}</td>
        <td class="col-seen">${a.lastSeen}</td>
      </tr>`).join("");
    el("agents-body").querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const agent = D.agents.find((a) => a.id === tr.dataset.id);
        window.openDrawer(agent, window.DashState.period);
      });
    });
  }
  document.querySelectorAll(".agents-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = -1; }
      document.querySelectorAll(".agents-table th").forEach((h) => h.classList.remove("active-sort"));
      th.classList.add("active-sort");
      renderTable(currentView);
    });
  });
  el("agent-search").addEventListener("input", (e) => { filterText = e.target.value.trim().toLowerCase(); renderTable(currentView); });

  // ---- Period switching ---------------------------------------------------
  function setPeriod(period) {
    window.DashState.period = period;
    currentView = computeView(period);
    renderKpis(currentView);
    updateMainChart(currentView);
    renderTable(currentView);
    if (window.TopPages) window.TopPages.render(period);
  }

  // ---- Boot ---------------------------------------------------------------
  currentView = computeView(30);
  renderKpis(currentView);
  renderLegend();
  initMainChart(currentView);
  renderTable(currentView);
  makeDropdown(el("range-select"), { value: 30, options: window.PERIOD_OPTIONS, onChange: setPeriod });
  if (window.TopPages) window.TopPages.render(30);
})();
