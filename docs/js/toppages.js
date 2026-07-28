/* Supertab Connect dashboard — bottom "Top Pages" tables (static, no drawer) */
(function () {
  "use strict";
  const D = window.DASHBOARD_DATA;
  const CBK = D.categoryByKey;

  // Compact number format: 73400 -> "73.4K", 2000 -> "2K", 552 -> "552"
  const compact = (n) => {
    if (n >= 1000) {
      const v = Math.round((n / 1000) * 10) / 10;
      return (Number.isInteger(v) ? v : v.toFixed(1)) + "K";
    }
    return String(n);
  };
  const trendFmt = (t) => (t >= 0 ? "+" : "−") + (Number.isInteger(t) ? Math.abs(t) : Math.abs(t).toFixed(1)) + "%";
  function hexToRgba(hex, a) {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Column order for the "by type" table (matches the product layout).
  const TYPE_ORDER = ["spoofed","page_preview","scraper","seo_tool","search_indexer",
    "ai_training","scanner","ai_search","ai_assistant","ai_agent","archiver","unclassified"];

  const AGENT_POOL = [
    "Unidentified bot (Microsoft Azure)", "Spoofed browser", "Spoofed browser (Google Cloud)",
    "Spoofed browser (Microsoft Azure)", "facebookexternalhit", "AdsBot-Google", "MJ12bot",
    "generic-bot", "Sogou", "AhrefsBot", "ClaudeBot", "Bingbot", "GPTBot", "Googlebot",
    "PerplexityBot", "Bytespider", "SemrushBot", "Amazonbot",
  ];

  // The fixed rows, generated-row definitions, and per-category weights all
  // come from the active dataset's `topPages` config (see data.js). A default
  // weight table covers any dataset that omits `baseW`.
  const TP = (window.ACTIVE_DATASET && window.ACTIVE_DATASET.topPages) || { fixed: [], gen: [] };
  const FIXED = TP.fixed || [];
  const GEN_DEFS = TP.gen || [];
  const BASE_W = TP.baseW || { spoofed:0.5, page_preview:0.14, scraper:0.1, seo_tool:0.06, search_indexer:0.05,
    ai_training:0.03, scanner:0.03, ai_search:0.02, ai_assistant:0.015, ai_agent:0.012, archiver:0.008, unclassified:0.055 };

  // --- Extra generated rows for depth ---------------------------------------
  function mulberry32(a){return function(){a|=0;a=a+0x6d2b79f5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function genRow(def) {
    const rng = mulberry32(hashString(def.url) ^ 0x51ed270b);
    const byType = {};
    TYPE_ORDER.forEach((k) => {
      const boost = k === def.boost ? 2.6 : 1;
      byType[k] = Math.round(def.scale * (BASE_W[k] || 0) * boost * (0.6 + rng() * 0.9));
    });
    const agents = [];
    const pool = AGENT_POOL.slice();
    for (let i = 0; i < 3; i++) agents.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const trend = Math.round((rng() * 45 - 38) * 10) / 10; // mostly negative
    return { url: def.url, trend, agents, byType };
  }

  const BASE_PAGES = FIXED.concat(GEN_DEFS.map(genRow)).map((p) => {
    let topType = TYPE_ORDER[0];
    TYPE_ORDER.forEach((k) => { if ((p.byType[k] || 0) > (p.byType[topType] || 0)) topType = k; });
    return Object.assign({}, p, { topType });
  });

  const gd = D.grandDaily, gtot = gd.reduce((a, b) => a + b, 0);
  function windowFraction(period) {
    return gtot ? gd.slice(-period).reduce((a, b) => a + b, 0) / gtot : 1;
  }

  function render(period) {
    const f = windowFraction(period);
    const pages = BASE_PAGES.map((p) => {
      const byType = {}; let total = 0;
      TYPE_ORDER.forEach((k) => { const v = Math.round((p.byType[k] || 0) * f); byType[k] = v; total += v; });
      return Object.assign({}, p, { byType, total });
    }).sort((a, b) => b.total - a.total);

    // Top Pages by Traffic
    document.getElementById("top-traffic-body").innerHTML = pages.map((p) => `
      <tr>
        <td class="path-cell">${p.url}</td>
        <td class="col-num">${compact(p.total)}</td>
        <td class="col-num"><span style="color:${p.trend >= 0 ? "#0f9d58" : "#d93025"};font-weight:600;">${trendFmt(p.trend)}</span></td>
        <td class="agents-cell">${p.agents.join(", ")}</td>
      </tr>`).join("");

    // Top Pages by Type — Top Type uses the same category pill as the Agents table
    document.getElementById("top-type-head").innerHTML = `
      <tr>
        <th>Page URL</th><th>Top Type</th>
        ${TYPE_ORDER.map((k) => `<th class="col-num">${CBK[k].label}</th>`).join("")}
      </tr>`;
    document.getElementById("top-type-body").innerHTML = pages.map((p) => {
      const c = CBK[p.topType];
      const cells = TYPE_ORDER.map((k) => {
        const v = p.byType[k] || 0;
        const strong = k === p.topType ? ' style="font-weight:700;"' : "";
        return `<td class="col-num"${strong}>${v ? compact(v) : 0}</td>`;
      }).join("");
      return `<tr>
        <td class="path-cell">${p.url}</td>
        <td><span class="cat-badge"><span class="dot" style="background:${c.color}"></span>${c.label}</span></td>
        ${cells}
      </tr>`;
    }).join("");
  }

  function snapshot(period) {
    const f = windowFraction(period);
    return BASE_PAGES.map((p) => {
      let total = 0;
      TYPE_ORDER.forEach((k) => { total += Math.round((p.byType[k] || 0) * f); });
      return { url: p.url, visits: total, trend_pct: p.trend, top_type: CBK[p.topType].label, top_agents: p.agents };
    }).sort((a, b) => b.visits - a.visits).slice(0, 6);
  }

  window.TopPages = { render, snapshot };
  render(30);
})();
