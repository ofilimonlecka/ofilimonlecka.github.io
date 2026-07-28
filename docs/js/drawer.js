/* Supertab Connect dashboard — agent detail side drawer */
(function () {
  "use strict";
  const D = window.DASHBOARD_DATA;
  const fmt = (n) => n.toLocaleString("en-US");
  const drawer = document.getElementById("drawer");
  const scrim = document.getElementById("drawer-scrim");
  let drawerChart = null;

  // deterministic "previous period" from the current daily series
  function prevPeriod(daily) {
    return daily.map((v, i) => {
      const shifted = daily[(i + 5) % daily.length];
      return Math.round(shifted * 0.8 + v * 0.12);
    });
  }

  // grayscale heat colour, light (low) -> dark (high)
  function heatColor(t) {
    // t in 0..1 ; interpolate #eef0f3 -> #14171c
    const a = [238, 240, 243], b = [20, 23, 28];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.pow(t, 0.85)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function heatmapHtml(agent) {
    let max = 1;
    agent.heatmap.forEach((row) => row.forEach((v) => (max = Math.max(max, v))));
    const rows = agent.heatmap.map((row, d) => {
      const cells = row.map((v, h) =>
        `<td class="h-cell" style="background:${heatColor(v / max)}" title="${D.dayLabels[d]} ${String(h).padStart(2,"0")}:00 · ${fmt(v)} requests"></td>`
      ).join("");
      return `<tr><td class="h-day">${D.dayLabels[d]}</td>${cells}</tr>`;
    }).join("");
    return `<div class="heatmap"><table class="heat-grid"><tbody>${rows}</tbody></table></div>
      <div class="heat-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span></div>`;
  }

  function pagesHtml(agent) {
    return agent.pages.map((p) => `
      <tr>
        <td class="path">${p.path}</td>
        <td class="num">${fmt(p.visits)}</td>
        <td class="num">
          <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;">
            <span style="color:#6b7280;font-variant-numeric:tabular-nums;">${p.pct.toFixed(1)}%</span>
            <span class="pct-bar"><span style="width:${Math.max(3, p.pct).toFixed(1)}%;background:${agent.color}"></span></span>
          </div>
        </td>
        <td class="seen">${p.lastSeen}</td>
      </tr>`).join("");
  }

  function render(agent) {
    const swatches = [0.08, 0.32, 0.58, 0.8, 1].map((t) =>
      `<span class="sw" style="background:${heatColor(t)}"></span>`).join("");
    drawer.innerHTML = `
      <div class="drawer-inner">
        <div class="drawer-head">
          <div>
            <div class="drawer-title">${agent.name}</div>
            <div class="drawer-sub">${agent.categoryLabel} · Last seen ${agent.lastSeen}</div>
          </div>
          <div class="drawer-actions">
            <button class="refresh-btn" id="drawer-refresh">↻ Refresh</button>
            <div class="range-select"><span class="cal">🗓</span> Last 30 days <span class="chev">▾</span></div>
            <button class="drawer-close" id="drawer-close">✕</button>
          </div>
        </div>
        <div class="updated-note">Updated 25s ago</div>

        <div class="stat-cards">
          <div class="stat-card"><div class="s-label">Visits</div><div class="s-value">${fmt(agent.total)}</div></div>
          <div class="stat-card"><div class="s-label">Top Day</div><div class="s-value">${agent.topDay}</div></div>
          <div class="stat-card"><div class="s-label">Pages Visited</div><div class="s-value">${agent.pagesVisited}</div></div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Visits Over Time</h3>
              <p class="sub">${agent.name} visits across the selected period with comparison</p>
            </div>
            <div class="mini-legend">
              <span class="ml"><span class="dot" style="background:#374151"></span>Current period</span>
              <span class="ml"><span class="dot" style="background:#c3c8d0"></span>Previous period</span>
              <span class="ml avg"><span class="dot" style="background:#f59e0b"></span>Average</span>
            </div>
          </div>
          <div class="drawer-chart" id="drawer-chart"></div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Request Patterns</h3>
              <p class="sub">Hourly traffic distribution</p>
            </div>
            <span class="utc-badge">UTC</span>
          </div>
          <div class="pattern-tiles">
            <div class="p-tile">
              <div class="t-label">Peak Hour</div>
              <div class="t-value">${agent.patterns.peakHour.range}</div>
              <div class="t-sub">${agent.patterns.peakHour.day}, ${fmt(agent.patterns.peakHour.value)} requests</div>
            </div>
            <div class="p-tile">
              <div class="t-label">Busiest Day</div>
              <div class="t-value">${agent.patterns.busiestDay.label}</div>
              <div class="t-sub">${fmt(agent.patterns.busiestDay.total)} total requests</div>
            </div>
            <div class="p-tile">
              <div class="t-label">Quiet Period</div>
              <div class="t-value">${agent.patterns.quietPeriod.range}</div>
              <div class="t-sub">Avg ${fmt(agent.patterns.quietPeriod.avgPerHour)}/hour</div>
            </div>
          </div>
          <div class="heat-legend">Low ${swatches} High</div>
          ${heatmapHtml(agent)}
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Pages</h3>
              <p class="sub">Top paths requested by ${agent.name}</p>
            </div>
          </div>
          <table class="pages-table">
            <thead><tr><th>Path</th><th class="num">Visits</th><th class="num">Share</th><th>Last seen</th></tr></thead>
            <tbody>${pagesHtml(agent)}</tbody>
          </table>
        </div>
      </div>`;

    document.getElementById("drawer-close").addEventListener("click", close);

    // Visits Over Time chart
    const prev = prevPeriod(agent.daily);
    const avg = Math.round(agent.total / agent.daily.length);
    drawerChart = echarts.init(document.getElementById("drawer-chart"));
    drawerChart.setOption({
      grid: { left: 46, right: 18, top: 12, bottom: 30 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#fff", borderColor: "#e8eaed", borderWidth: 1,
        extraCssText: "box-shadow:0 12px 40px rgba(16,24,40,.16);border-radius:10px;",
        formatter: (ps) => {
          const idx = ps[0].dataIndex;
          return `<div style="padding:8px 10px;font-size:12.5px;">
            <div style="font-weight:650;margin-bottom:4px;">${D.dates[idx].long}</div>
            ${ps.map((p) => `<div style="display:flex;gap:10px;justify-content:space-between;">
              <span style="color:#6b7280;">${p.seriesName}</span>
              <b style="font-variant-numeric:tabular-nums;">${fmt(p.value || 0)}</b></div>`).join("")}
          </div>`;
        },
      },
      xAxis: {
        type: "category", boundaryGap: false, data: D.dates.map((d) => d.label),
        axisLine: { lineStyle: { color: "#e8eaed" } }, axisTick: { show: false },
        axisLabel: { color: "#9aa1ab", interval: 5, fontSize: 11 },
      },
      yAxis: {
        type: "value", splitLine: { lineStyle: { color: "#f0f1f4", type: "dashed" } },
        axisLabel: { color: "#9aa1ab", fontSize: 11, formatter: (v) => (v >= 1000 ? v / 1000 + "K" : v) },
      },
      series: [
        {
          name: "Previous period", type: "line", smooth: 0.4, symbol: "none",
          lineStyle: { color: "#c3c8d0", width: 2, type: "dashed" }, data: prev, z: 1,
        },
        {
          name: "Current period", type: "line", smooth: 0.4, symbol: "none",
          lineStyle: { color: "#374151", width: 2.4 },
          areaStyle: { color: "rgba(55,65,81,0.06)" },
          data: agent.daily, z: 3,
          markLine: {
            silent: true, symbol: "none",
            lineStyle: { color: "#f59e0b", width: 2, type: "solid" },
            label: { show: false },
            data: [{ yAxis: avg, name: "Average" }],
          },
        },
      ],
    });
  }

  function open(agent) {
    render(agent);
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    scrim.classList.add("open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => drawerChart && drawerChart.resize());
  }
  function close() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    scrim.classList.remove("open");
    document.body.style.overflow = "";
    if (drawerChart) { drawerChart.dispose(); drawerChart = null; }
  }
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.addEventListener("resize", () => drawerChart && drawerChart.resize());

  window.openDrawer = open;
})();
