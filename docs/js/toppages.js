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

  // --- Fixed rows that mirror the real product exports exactly ---------------
  const FIXED = [
    { url: "/", trend: 0.3, agents: ["Unidentified bot (Microsoft Azure)", "Spoofed browser", "facebookexternalhit"],
      byType: { spoofed:46700, page_preview:12600, scraper:7600, seo_tool:4200, search_indexer:1000,
                ai_training:552, scanner:516, ai_search:134, ai_assistant:30, ai_agent:18, archiver:10, unclassified:40 } },
    { url: "/supertab-connect", trend: -39, agents: ["AdsBot-Google", "Spoofed browser", "facebookexternalhit"],
      byType: { spoofed:533, page_preview:253, scraper:247, seo_tool:11, search_indexer:925,
                ai_training:14, scanner:0, ai_search:4, ai_assistant:0, ai_agent:0, archiver:0, unclassified:13 } },
    { url: "/robots.txt", trend: -12, agents: ["MJ12bot", "Spoofed browser (Google Cloud)", "generic-bot"],
      byType: { spoofed:250, page_preview:57, scraper:169, seo_tool:460, search_indexer:132,
                ai_training:142, scanner:0, ai_search:98, ai_assistant:0, ai_agent:0, archiver:0, unclassified:0 } },
    { url: "/learn", trend: -9, agents: ["Sogou", "Spoofed browser", "Spoofed browser (Microsoft Azure)"],
      byType: { spoofed:161, page_preview:24, scraper:43, seo_tool:17, search_indexer:105,
                ai_training:14, scanner:1, ai_search:9, ai_assistant:0, ai_agent:0, archiver:0, unclassified:10 } },
    { url: "/sitemap.xml", trend: -24, agents: ["AhrefsBot", "ClaudeBot", "Bingbot"],
      byType: { spoofed:36, page_preview:0, scraper:8, seo_tool:108, search_indexer:26,
                ai_training:42, scanner:0, ai_search:0, ai_assistant:0, ai_agent:0, archiver:0, unclassified:0 } },
  ];

  // --- Extra generated rows for depth ---------------------------------------
  function mulberry32(a){return function(){a|=0;a=a+0x6d2b79f5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  const BASE_W = { spoofed:0.5, page_preview:0.14, scraper:0.1, seo_tool:0.06, search_indexer:0.05,
    ai_training:0.03, scanner:0.03, ai_search:0.02, ai_assistant:0.015, ai_agent:0.012, archiver:0.008, unclassified:0.055 };
  const GEN_DEFS = [
    { url: "/genai/", scale: 1500, boost: "ai_training" },
    { url: "/blog/ai-content-licensing-for-publishers", scale: 1100, boost: "ai_search" },
    { url: "/about", scale: 720, boost: "page_preview" },
    { url: "/pricing", scale: 540, boost: "search_indexer" },
    { url: "/consumers", scale: 300, boost: "spoofed" },
    { url: "/blog/supertab-rsl-announcement", scale: 190, boost: "page_preview" },
  ];
  function genRow(def) {
    const rng = mulberry32(hashString(def.url) ^ 0x51ed270b);
    const byType = {};
    TYPE_ORDER.forEach((k) => {
      const boost = k === def.boost ? 2.6 : 1;
      byType[k] = Math.round(def.scale * BASE_W[k] * boost * (0.6 + rng() * 0.9));
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

  window.TopPages = { render };
  render(30);
})();
