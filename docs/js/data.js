/*
 * Supertab Connect — Bot Classification Dashboard (prototype)
 * ------------------------------------------------------------
 * MOCK / SAMPLE DATA. None of this is real traffic. It is generated
 * deterministically (seeded) so the dashboard looks the same on every
 * reload. Numbers are shaped to resemble the real Connect "Agents & Bots"
 * view but are entirely synthetic.
 *
 * There are several interchangeable *datasets* (traffic profiles) defined in
 * DATASETS below. The active one is chosen from the `?dataset=` URL param, then
 * localStorage, then the default (the first entry). Switching datasets lets us
 * see how the AI-summary prompt behaves across very different traffic shapes.
 */
(function () {
  "use strict";

  // ---- Seeded PRNG (mulberry32) -------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---- Categories (shared across all datasets) ----------------------------
  const CATEGORIES = [
    { key: "spoofed",        label: "Spoofed",        color: "#8b5cf6", desc: "Traffic disguising itself as a normal human browser." },
    { key: "unclassified",   label: "Unclassified",   color: "#334155", desc: "Automated traffic we could not confidently attribute." },
    { key: "page_preview",   label: "Page Preview",   color: "#9ca3af", desc: "Link-unfurling / preview fetchers (social, chat apps)." },
    { key: "scraper",        label: "Scraper",        color: "#ef4444", desc: "Bulk content scrapers and crawlers." },
    { key: "scanner",        label: "Scanner",        color: "#991b1b", desc: "Uptime monitors and security/vulnerability scanners." },
    { key: "seo_tool",       label: "SEO Tool",       color: "#f59e0b", desc: "Backlink & SEO analysis crawlers." },
    { key: "search_indexer", label: "Search Indexer", color: "#eab308", desc: "Traditional search-engine indexers." },
    { key: "ai_training",    label: "AI Training",    color: "#f43f5e", desc: "Crawlers gathering data to train AI models." },
    { key: "ai_assistant",   label: "AI Assistant",   color: "#14b8a6", desc: "User-triggered fetches from AI assistants." },
    { key: "ai_search",      label: "AI Search",      color: "#60a5fa", desc: "AI-powered search & answer engines." },
    { key: "archiver",       label: "Archiver",       color: "#64748b", desc: "Web-archiving crawlers." },
    { key: "ai_agent",       label: "AI Agent",       color: "#3b82f6", desc: "Autonomous agents browsing on a user's behalf." },
  ];
  const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

  // ---- Date range: 30 days ending 2026-07-28 (shared) ---------------------
  const END = new Date(Date.UTC(2026, 6, 28)); // Jul 28 2026
  const DAYS = 30;
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dates = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(END.getTime() - i * 86400000);
    dates.push({
      date: d,
      label: MONTHS[d.getUTCMonth()] + " " + d.getUTCDate(),
      long: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getUTCDay()] +
            ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear(),
    });
  }

  // Diurnal + weekday patterns for the request-pattern heatmaps (shared).
  const HOUR_BASE = [
    0.30,0.25,0.20,0.20,0.25,0.35, 0.50,0.65,0.80,0.85,0.80,0.82,
    0.85,0.80,0.82,0.85,0.88,0.90, 1.00,0.95,0.80,0.65,0.50,0.40,
  ];
  const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DAY_LONG = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const DAY_BASE = [1.0, 0.85, 0.70, 0.65, 0.60, 0.50, 0.55];

  const LAST_SEEN_POOL = ["just now","17 min ago","36 min ago","1h ago","3h ago","12h ago",
    "13h ago","15h ago","22h ago","1d ago","3d ago","4d ago","6d ago","1w ago","2w ago"];

  // ---- Default path pools (Supertab.co) -----------------------------------
  const PATHS_CONTENT = [
    "/", "/genai/", "/genai", "/about", "/legal", "/consumers", "/personal",
    "/blog/unlocking-deepak-chopras-insights-for-peak-living",
    "/blog/supertab-rsl-announcement", "/blog/maine-trust",
    "/blog/how-to-read-news-articles-behind-paywalls",
    "/blog/a-beginners-guide-to-content-monetization-strategies-that-scale",
    "/blog/ai-content-licensing-for-publishers",
    "/blog/supertab-ceo-joins-the-digital-executive-podcast",
    "/post/how-to-read-news-articles-behind-paywalls",
    "/careers/senior-backend-engineer-python", "/google-jp",
    "/wp-content/uploads/2022/08/supertab.svg",
  ];
  const PATHS_JUNK = [
    "/sitemap.xml", "/robots.txt", "/favicon.ico", "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png", "/meta.json", "/.well-known/ucp",
    "/2019/wp-includes/wlwmanifest.xml", "/2018/wp-includes/wlwmanifest.xml",
    "/shop/wp-includes/wlwmanifest.xml", "/news/wp-includes/wlwmanifest.xml",
    "/sito/wp-includes/wlwmanifest.xml", "/website/wp-includes/wlwmanifest.xml",
    "/wp2/wp-includes/wlwmanifest.xml", "/media/wp-includes/wlwmanifest.xml",
    "/wp-includes/wlwmanifest.xml", "/user22334455/https:/supertab.co",
  ];

  // ---- Traffic "shapes" (30-day daily curve, 0..1) ------------------------
  // Ramps up from launch, plateaus, dips mid-period, climbs to a peak, tapers.
  const SHAPE_SUPERTAB = [
    0.03, 0.35, 0.55, 0.60, 0.58, 0.62, 0.66, 0.72, 0.66, 0.58,
    0.50, 0.47, 0.52, 0.56, 0.60, 0.68, 0.78, 0.84, 0.80, 0.78,
    0.82, 0.86, 0.84, 0.88, 0.93, 0.97, 1.00, 0.90, 0.72, 0.55,
  ];
  // Climbs steadily to a peak at the very end (strong positive trend).
  const SHAPE_AI_SURGE = [
    0.20, 0.22, 0.25, 0.24, 0.28, 0.30, 0.33, 0.36, 0.34, 0.38,
    0.42, 0.45, 0.48, 0.52, 0.55, 0.60, 0.64, 0.68, 0.72, 0.75,
    0.78, 0.82, 0.85, 0.88, 0.90, 0.93, 0.95, 0.97, 0.99, 1.00,
  ];
  // Steady, then a sharp spike ~day 18-19, then a hard decline (net negative).
  const SHAPE_SCRAPER_SPIKE = [
    0.55, 0.58, 0.60, 0.62, 0.60, 0.58, 0.56, 0.54, 0.52, 0.50,
    0.52, 0.55, 0.58, 0.62, 0.66, 0.70, 0.74, 0.80, 0.86, 0.82,
    0.72, 0.60, 0.50, 0.44, 0.40, 0.38, 0.36, 0.34, 0.32, 0.30,
  ];
  // Flat and slightly declining, low amplitude — a calm, quiet site.
  const SHAPE_QUIET = [
    0.62, 0.60, 0.61, 0.59, 0.60, 0.58, 0.57, 0.59, 0.56, 0.55,
    0.57, 0.54, 0.55, 0.53, 0.54, 0.52, 0.53, 0.51, 0.52, 0.50,
    0.51, 0.49, 0.50, 0.48, 0.49, 0.47, 0.48, 0.46, 0.47, 0.45,
  ];
  // Steady with a big "breaking news" bump ~day 22, then settling.
  const SHAPE_NEWS = [
    0.55, 0.58, 0.56, 0.60, 0.62, 0.58, 0.60, 0.64, 0.62, 0.60,
    0.63, 0.66, 0.64, 0.62, 0.66, 0.70, 0.68, 0.72, 0.74, 0.76,
    0.80, 0.88, 1.00, 0.92, 0.80, 0.74, 0.72, 0.70, 0.68, 0.66,
  ];
  // Climbs into a seasonal sale peak ~day 25-26, then tapers off.
  const SHAPE_ECOMMERCE = [
    0.40, 0.42, 0.41, 0.44, 0.46, 0.45, 0.48, 0.50, 0.49, 0.52,
    0.54, 0.53, 0.56, 0.58, 0.60, 0.62, 0.64, 0.66, 0.68, 0.70,
    0.74, 0.78, 0.82, 0.88, 0.94, 1.00, 0.96, 0.85, 0.72, 0.60,
  ];

  // ---- Builders (parameterised by shape + path pools) ---------------------
  function buildDaily(rng, weight, bumpIdx, firstSeen, shape) {
    firstSeen = firstSeen || 0;
    const raw = [];
    for (let i = 0; i < DAYS; i++) {
      if (i < firstSeen) { raw.push(0); continue; } // not yet seen
      let s = shape[i];
      if (bumpIdx != null) {
        s += 0.9 * Math.exp(-Math.pow(i - bumpIdx, 2) / (2 * 1.3 * 1.3));
      }
      // newly-arrived agents ramp up over their first few days
      const ramp = firstSeen > 0 ? Math.min(1, (i - firstSeen + 1) / 4) : 1;
      const noise = 0.72 + rng() * 0.56; // 0.72 .. 1.28
      raw.push(Math.max(0.001, s * noise * ramp));
    }
    const sum = raw.reduce((a, b) => a + b, 0);
    const scale = weight / sum;
    return raw.map((v) => Math.round(v * scale));
  }

  function buildHeatmap(rng, weeklyTotal) {
    const m = [];
    let baseSum = 0;
    const base = [];
    for (let d = 0; d < 7; d++) {
      base.push([]);
      for (let h = 0; h < 24; h++) {
        const v = DAY_BASE[d] * HOUR_BASE[h] * (0.7 + rng() * 0.6);
        base[d].push(v);
        baseSum += v;
      }
    }
    const scale = weeklyTotal / baseSum;
    for (let d = 0; d < 7; d++) {
      m.push(base[d].map((v) => Math.round(v * scale)));
    }
    return m;
  }

  function heatmapStats(m) {
    // Peak single cell
    let peak = { d: 0, h: 0, v: -1 };
    const daySums = new Array(7).fill(0);
    const hourAcross = new Array(24).fill(0); // sum over all days per hour
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = m[d][h];
        daySums[d] += v;
        hourAcross[h] += v;
        if (v > peak.v) peak = { d, h, v };
      }
    }
    let busiest = 0;
    for (let d = 1; d < 7; d++) if (daySums[d] > daySums[busiest]) busiest = d;
    // Quietest 4-hour window (wrapping) by average across all days
    let best = { start: 0, avg: Infinity };
    for (let start = 0; start < 24; start++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += hourAcross[(start + k) % 24];
      const avg = s / (4 * 7);
      if (avg < best.avg) best = { start, avg };
    }
    const fmtH = (h) => String(h).padStart(2, "0") + ":00";
    return {
      peakHour: {
        range: fmtH(peak.h) + "-" + fmtH((peak.h + 1) % 24),
        day: DAY_LABELS[peak.d],
        value: peak.v,
      },
      busiestDay: { label: DAY_LONG[busiest], total: daySums[busiest] },
      quietPeriod: {
        range: fmtH(best.start) + "-" + fmtH((best.start + 4) % 24),
        avgPerHour: Math.round(best.avg),
      },
    };
  }

  function buildPages(rng, agent, total, pathsContent, pathsJunk) {
    const pool = (agent.pool === "junk"
      ? pathsJunk.concat(pathsContent.slice(0, 6))
      : pathsContent.concat(pathsJunk.slice(0, 6))
    ).slice();
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const n = Math.min(agent.pages, pool.length);
    const chosen = pool.slice(0, n);
    // Zipf-ish weights
    const weights = chosen.map((_, i) => 1 / Math.pow(i + 1, 0.85) * (0.7 + rng() * 0.6));
    const wsum = weights.reduce((a, b) => a + b, 0);
    let pages = chosen.map((path, i) => {
      const visits = Math.max(1, Math.round((weights[i] / wsum) * total));
      return { path, visits, lastSeen: LAST_SEEN_POOL[Math.floor(rng() * LAST_SEEN_POOL.length)] };
    });
    pages.sort((a, b) => b.visits - a.visits);
    const realTotal = pages.reduce((a, b) => a + b.visits, 0);
    pages.forEach((p) => (p.pct = (p.visits / realTotal) * 100));
    return pages;
  }

  // ---- Assemble a full dataset from a config ------------------------------
  function buildDashboardData(config) {
    const shape = config.shape || SHAPE_SUPERTAB;
    const pathsContent = config.pathsContent || PATHS_CONTENT;
    const pathsJunk = config.pathsJunk || PATHS_JUNK;

    const agents = config.agents.map((a, idx) => {
      const rng = mulberry32(hashString(a.name) ^ 0x9e3779b9);
      const daily = buildDaily(rng, a.weight, a.bump, a.first, shape);
      const total = daily.reduce((x, y) => x + y, 0);
      let topIdx = 0;
      for (let i = 1; i < daily.length; i++) if (daily[i] > daily[topIdx]) topIdx = i;
      const weekly = Math.max(50, Math.round((total / DAYS) * 7));
      const heatmap = buildHeatmap(rng, weekly);
      const stats = heatmapStats(heatmap);
      const pages = buildPages(rng, a, total, pathsContent, pathsJunk);
      return {
        id: "agent-" + idx,
        name: a.name,
        category: a.cat,
        categoryLabel: CATEGORY_BY_KEY[a.cat].label,
        color: CATEGORY_BY_KEY[a.cat].color,
        ua: a.ua,
        lastSeen: a.lastSeen || LAST_SEEN_POOL[Math.floor(rng() * 9)],
        firstSeen: a.first || 0,
        firstSeenLabel: a.first ? dates[a.first].label : null,
        daily,
        total,
        topDay: dates[topIdx].label,
        topDayLong: dates[topIdx].long,
        pagesVisited: pages.length,
        pages,
        heatmap,
        patterns: stats,
      };
    });

    // Category daily series (aggregate of member agents) for the main chart.
    const categorySeries = CATEGORIES.map((c) => {
      const sum = new Array(DAYS).fill(0);
      agents.filter((a) => a.category === c.key).forEach((a) => {
        a.daily.forEach((v, i) => (sum[i] += v));
      });
      return { key: c.key, label: c.label, color: c.color, daily: sum, total: sum.reduce((x, y) => x + y, 0) };
    });

    const grandDaily = new Array(DAYS).fill(0);
    categorySeries.forEach((c) => c.daily.forEach((v, i) => (grandDaily[i] += v)));
    const grandTotal = grandDaily.reduce((x, y) => x + y, 0);

    return {
      categories: CATEGORIES,
      categoryByKey: CATEGORY_BY_KEY,
      dates,
      dayLabels: DAY_LABELS,
      agents,
      categorySeries,
      grandDaily,
      grandTotal,
    };
  }

  // =========================================================================
  //  DATASETS
  //  Each is a distinct traffic profile. `agents` fields:
  //    name, cat, weight (target 30-day visits), pages (# distinct paths), ua,
  //    pool ("content"|"junk"), first? (day index an agent first appears),
  //    bump? (day index of a traffic spike), lastSeen?
  //  `topPages` feeds the two "Top Pages" tables (see toppages.js):
  //    baseW (per-category weight for generated rows), fixed (explicit rows),
  //    gen (generated-row definitions {url, scale, boost}).
  // =========================================================================

  const BASEW_DEFAULT = { spoofed:0.5, page_preview:0.14, scraper:0.1, seo_tool:0.06, search_indexer:0.05,
    ai_training:0.03, scanner:0.03, ai_search:0.02, ai_assistant:0.015, ai_agent:0.012, archiver:0.008, unclassified:0.055 };

  // ---- 1) Supertab.co (default; identical to the original prototype) ------
  const DATASET_SUPERTAB = {
    key: "supertab",
    label: "Supertab.co (default)",
    sitePill: "supertab.co",
    shape: SHAPE_SUPERTAB,
    pathsContent: PATHS_CONTENT,
    pathsJunk: PATHS_JUNK,
    agents: [
      // Spoofed (dominant)
      { name: "Spoofed Chrome 138",   cat: "spoofed", weight: 180000, pages: 44, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", pool: "junk" },
      { name: "Spoofed Safari 17",    cat: "spoofed", weight: 95000,  pages: 38, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", pool: "junk" },
      { name: "Spoofed Firefox",      cat: "spoofed", weight: 75000,  pages: 30, ua: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", pool: "junk" },
      // Unclassified
      { name: "Unclassified",         cat: "unclassified", weight: 90000, pages: 52, ua: "-", pool: "junk" },
      // Page Preview
      { name: "facebookexternalhit",  cat: "page_preview", weight: 53168, pages: 26, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", lastSeen: "17 min ago", bump: 21, pool: "content" },
      { name: "Twitterbot",           cat: "page_preview", weight: 12000, pages: 20, ua: "Twitterbot/1.0", pool: "content" },
      { name: "Slackbot-LinkExpanding", cat: "page_preview", weight: 8000, pages: 16, ua: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", pool: "content" },
      { name: "WhatsApp",             cat: "page_preview", weight: 4500, pages: 12, ua: "WhatsApp/2.24", pool: "content" },
      { name: "LinkedInBot",          cat: "page_preview", weight: 3000, pages: 10, ua: "LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)", pool: "content" },
      // Scraper
      { name: "Bytespider",           cat: "scraper", weight: 12000, pages: 40, ua: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", pool: "content" },
      { name: "RebelMouse",           cat: "scraper", weight: 7000,  pages: 24, ua: "RebelMouse/1.0 (+https://www.rebelmouse.com)", pool: "content" },
      { name: "Scrapy",               cat: "scraper", weight: 4000,  pages: 18, ua: "Scrapy/2.11 (+https://scrapy.org)", pool: "content" },
      { name: "python-requests",      cat: "scraper", weight: 3000,  pages: 14, ua: "python-requests/2.32", pool: "junk" },
      // Scanner
      { name: "Pingdom",              cat: "scanner", weight: 6000, pages: 6,  ua: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)", lastSeen: "1h ago", pool: "junk" },
      { name: "UptimeRobot",          cat: "scanner", weight: 3500, pages: 4,  ua: "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)", pool: "junk" },
      { name: "Censys",               cat: "scanner", weight: 2500, pages: 8,  ua: "Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)", pool: "junk" },
      // SEO Tool
      { name: "AhrefsBot",            cat: "seo_tool", weight: 12000, pages: 48, ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", pool: "content" },
      { name: "SemrushBot",           cat: "seo_tool", weight: 8000,  pages: 36, ua: "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)", pool: "content" },
      { name: "DotBot",               cat: "seo_tool", weight: 3000,  pages: 20, ua: "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)", pool: "content" },
      // Search Indexer
      { name: "Googlebot",            cat: "search_indexer", weight: 6000, pages: 40, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Bingbot",              cat: "search_indexer", weight: 3500, pages: 30, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", pool: "content" },
      { name: "DuckDuckBot",          cat: "search_indexer", weight: 1500, pages: 16, ua: "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", pool: "content" },
      // AI Training
      { name: "GPTBot",               cat: "ai_training", weight: 7000, pages: 38, ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", pool: "content" },
      { name: "ClaudeBot",            cat: "ai_training", weight: 5000, pages: 34, ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", pool: "content" },
      { name: "Amazonbot",            cat: "ai_training", weight: 2500, pages: 22, ua: "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", pool: "content" },
      { name: "CCBot",                cat: "ai_training", weight: 1800, pages: 26, ua: "CCBot/2.0 (https://commoncrawl.org/faq/)", pool: "content", first: 8 },
      // AI Search
      { name: "OAI-SearchBot",        cat: "ai_search", weight: 4000, pages: 24, ua: "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", pool: "content", first: 14 },
      { name: "PerplexityBot",        cat: "ai_search", weight: 2800, pages: 20, ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", pool: "content" },
      { name: "Claude-SearchBot",     cat: "ai_search", weight: 700, pages: 14, ua: "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +search@anthropic.com)", pool: "content", first: 27 },
      // AI Assistant
      { name: "ChatGPT-User",         cat: "ai_assistant", weight: 3500, pages: 18, ua: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", pool: "content" },
      { name: "Perplexity-User",      cat: "ai_assistant", weight: 1100, pages: 12, ua: "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai)", pool: "content", first: 23 },
      { name: "Claude-User",          cat: "ai_assistant", weight: 1200, pages: 10, ua: "Mozilla/5.0 (compatible; Claude-User/1.0; +user@anthropic.com)", pool: "content", first: 17 },
      // AI Agent
      { name: "ChatGPT-Agent",        cat: "ai_agent", weight: 2800, pages: 16, ua: "Mozilla/5.0 (compatible; ChatGPT-Agent/1.0; +https://openai.com/agent)", pool: "content" },
      { name: "Operator",             cat: "ai_agent", weight: 1000, pages: 12, ua: "Mozilla/5.0 (compatible; Operator/1.0; +https://openai.com/operator)", pool: "content", first: 25 },
      { name: "Gemini-Agent",         cat: "ai_agent", weight: 900,  pages: 9,  ua: "Mozilla/5.0 (compatible; Gemini-Agent/1.0; +https://deepmind.google)", pool: "content", first: 20 },
      // Archiver
      { name: "archive.org_bot",      cat: "archiver", weight: 1400, pages: 28, ua: "Mozilla/5.0 (compatible; archive.org_bot; +http://archive.org/details/archive.org_bot)", pool: "content" },
      { name: "Wayback Save",         cat: "archiver", weight: 600,  pages: 8,  ua: "Wayback/2.0 (+http://web.archive.org)", pool: "content" },
    ],
    topPages: {
      baseW: BASEW_DEFAULT,
      fixed: [
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
      ],
      gen: [
        { url: "/genai/", scale: 1500, boost: "ai_training" },
        { url: "/blog/ai-content-licensing-for-publishers", scale: 1100, boost: "ai_search" },
        { url: "/about", scale: 720, boost: "page_preview" },
        { url: "/pricing", scale: 540, boost: "search_indexer" },
        { url: "/consumers", scale: 300, boost: "spoofed" },
        { url: "/blog/supertab-rsl-announcement", scale: 190, boost: "page_preview" },
      ],
    },
  };

  // ---- 2) AI surge --------------------------------------------------------
  const DATASET_AI_SURGE = {
    key: "ai-surge",
    label: "AI surge",
    sitePill: "ai-lab.dev",
    shape: SHAPE_AI_SURGE,
    pathsContent: [
      "/", "/docs/", "/docs/quickstart", "/docs/api-reference", "/docs/models",
      "/blog/introducing-our-new-model", "/blog/how-agents-use-our-docs",
      "/research/scaling-laws", "/research/agent-benchmarks", "/changelog",
      "/pricing", "/cookbook/rag", "/cookbook/tool-use", "/community", "/status",
    ],
    pathsJunk: PATHS_JUNK,
    agents: [
      // AI Training (dominant + growing)
      { name: "GPTBot",               cat: "ai_training", weight: 46000, pages: 42, ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", pool: "content" },
      { name: "ClaudeBot",            cat: "ai_training", weight: 38000, pages: 40, ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", pool: "content" },
      { name: "Google-Extended",      cat: "ai_training", weight: 24000, pages: 34, ua: "Mozilla/5.0 (compatible; Google-Extended/1.0; +https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)", pool: "content" },
      { name: "Amazonbot",            cat: "ai_training", weight: 13000, pages: 26, ua: "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", pool: "content" },
      { name: "CCBot",                cat: "ai_training", weight: 9000,  pages: 30, ua: "CCBot/2.0 (https://commoncrawl.org/faq/)", pool: "content", first: 6 },
      { name: "Meta-ExternalAgent",   cat: "ai_training", weight: 8000,  pages: 24, ua: "Mozilla/5.0 (compatible; meta-externalagent/1.1; +https://developers.facebook.com/docs/sharing/webmasters/crawler)", pool: "content", first: 11 },
      // AI Search (growing)
      { name: "OAI-SearchBot",        cat: "ai_search", weight: 30000, pages: 26, ua: "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", pool: "content" },
      { name: "PerplexityBot",        cat: "ai_search", weight: 24000, pages: 22, ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", pool: "content" },
      { name: "Claude-SearchBot",     cat: "ai_search", weight: 11000, pages: 18, ua: "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +search@anthropic.com)", pool: "content", first: 13 },
      // AI Assistant (several brand-new)
      { name: "ChatGPT-User",         cat: "ai_assistant", weight: 20000, pages: 20, ua: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", pool: "content" },
      { name: "Claude-User",          cat: "ai_assistant", weight: 12000, pages: 14, ua: "Mozilla/5.0 (compatible; Claude-User/1.0; +user@anthropic.com)", pool: "content", first: 12 },
      { name: "Perplexity-User",      cat: "ai_assistant", weight: 8000,  pages: 12, ua: "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai)", pool: "content", first: 17 },
      { name: "Gemini-User",          cat: "ai_assistant", weight: 5000,  pages: 10, ua: "Mozilla/5.0 (compatible; Gemini-User/1.0; +https://gemini.google.com)", pool: "content", first: 20 },
      // AI Agent (the newest wave)
      { name: "ChatGPT-Agent",        cat: "ai_agent", weight: 16000, pages: 18, ua: "Mozilla/5.0 (compatible; ChatGPT-Agent/1.0; +https://openai.com/agent)", pool: "content", first: 8 },
      { name: "Operator",             cat: "ai_agent", weight: 9000,  pages: 14, ua: "Mozilla/5.0 (compatible; Operator/1.0; +https://openai.com/operator)", pool: "content", first: 15 },
      { name: "Gemini-Agent",         cat: "ai_agent", weight: 6000,  pages: 10, ua: "Mozilla/5.0 (compatible; Gemini-Agent/1.0; +https://deepmind.google)", pool: "content", first: 19 },
      { name: "Claude-Agent",         cat: "ai_agent", weight: 4500,  pages: 9,  ua: "Mozilla/5.0 (compatible; Claude-Agent/1.0; +agent@anthropic.com)", pool: "content", first: 23 },
      // Non-AI baseline (for contrast)
      { name: "Googlebot",            cat: "search_indexer", weight: 12000, pages: 40, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Bingbot",              cat: "search_indexer", weight: 6000,  pages: 30, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", pool: "content" },
      { name: "AhrefsBot",            cat: "seo_tool", weight: 8000, pages: 36, ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", pool: "content" },
      { name: "facebookexternalhit",  cat: "page_preview", weight: 10000, pages: 20, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", pool: "content" },
      { name: "Twitterbot",           cat: "page_preview", weight: 4000,  pages: 14, ua: "Twitterbot/1.0", pool: "content" },
      { name: "Spoofed Chrome 138",   cat: "spoofed", weight: 15000, pages: 30, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", pool: "junk" },
      { name: "Bytespider",           cat: "scraper", weight: 6000, pages: 30, ua: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", pool: "content" },
      { name: "Pingdom",              cat: "scanner", weight: 3000, pages: 6, ua: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)", pool: "junk" },
      { name: "Unclassified",         cat: "unclassified", weight: 8000, pages: 40, ua: "-", pool: "junk" },
    ],
    topPages: {
      baseW: { spoofed:0.06, page_preview:0.06, scraper:0.05, seo_tool:0.05, search_indexer:0.09,
        ai_training:0.28, scanner:0.02, ai_search:0.18, ai_assistant:0.1, ai_agent:0.08, archiver:0.01, unclassified:0.04 },
      fixed: [
        { url: "/docs/api-reference", trend: 112, agents: ["GPTBot", "ClaudeBot", "OAI-SearchBot"],
          byType: { ai_training:24800, ai_search:9600, ai_agent:4100, ai_assistant:3800, search_indexer:2600,
                    seo_tool:900, page_preview:700, scraper:1200, spoofed:2100, scanner:120, archiver:60, unclassified:300 } },
        { url: "/docs/quickstart", trend: 88, agents: ["ClaudeBot", "ChatGPT-User", "PerplexityBot"],
          byType: { ai_training:15200, ai_search:7400, ai_assistant:5200, ai_agent:3600, search_indexer:1900,
                    seo_tool:600, page_preview:900, scraper:800, spoofed:1500, scanner:60, archiver:40, unclassified:200 } },
        { url: "/docs/models", trend: 154, agents: ["GPTBot", "Google-Extended", "Claude-SearchBot"],
          byType: { ai_training:18900, ai_search:6100, ai_agent:2400, ai_assistant:2100, search_indexer:1400,
                    seo_tool:500, page_preview:400, scraper:900, spoofed:1100, scanner:40, archiver:30, unclassified:150 } },
        { url: "/cookbook/tool-use", trend: 203, agents: ["ChatGPT-Agent", "Operator", "Claude-Agent"],
          byType: { ai_agent:6800, ai_training:5200, ai_search:3100, ai_assistant:2900, search_indexer:700,
                    seo_tool:200, page_preview:300, scraper:400, spoofed:600, scanner:20, archiver:10, unclassified:90 } },
        { url: "/research/scaling-laws", trend: 67, agents: ["CCBot", "GPTBot", "PerplexityBot"],
          byType: { ai_training:9800, ai_search:4200, ai_agent:1200, ai_assistant:900, search_indexer:1600,
                    seo_tool:800, page_preview:600, scraper:1400, spoofed:900, scanner:30, archiver:120, unclassified:130 } },
      ],
      gen: [
        { url: "/changelog", scale: 4200, boost: "ai_search" },
        { url: "/cookbook/rag", scale: 3600, boost: "ai_agent" },
        { url: "/blog/introducing-our-new-model", scale: 3000, boost: "ai_training" },
        { url: "/pricing", scale: 2200, boost: "ai_assistant" },
        { url: "/research/agent-benchmarks", scale: 1600, boost: "ai_agent" },
        { url: "/", scale: 5200, boost: "search_indexer" },
      ],
    },
  };

  // ---- 3) Scraper spike ---------------------------------------------------
  const DATASET_SCRAPER_SPIKE = {
    key: "scraper-spike",
    label: "Scraper spike",
    sitePill: "docs.example.com",
    shape: SHAPE_SCRAPER_SPIKE,
    pathsContent: [
      "/", "/docs/", "/docs/getting-started", "/api/v1/products", "/api/v1/users",
      "/guide/installation", "/reference/cli", "/reference/config", "/blog/release-notes",
      "/tutorials/first-app", "/faq", "/support",
    ],
    pathsJunk: PATHS_JUNK,
    agents: [
      // Scrapers (dominant, spiking mid-period)
      { name: "Bytespider",           cat: "scraper", weight: 62000, pages: 40, ua: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", pool: "content", bump: 18 },
      { name: "MJ12bot",              cat: "scraper", weight: 30000, pages: 34, ua: "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)", pool: "content", bump: 19 },
      { name: "python-requests",      cat: "scraper", weight: 26000, pages: 18, ua: "python-requests/2.32", pool: "junk", bump: 18 },
      { name: "Scrapy",               cat: "scraper", weight: 18000, pages: 20, ua: "Scrapy/2.11 (+https://scrapy.org)", pool: "content", bump: 19, first: 12 },
      { name: "DataForSeoBot",        cat: "scraper", weight: 12000, pages: 24, ua: "Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)", pool: "content", bump: 20 },
      { name: "RebelMouse",           cat: "scraper", weight: 8000,  pages: 22, ua: "RebelMouse/1.0 (+https://www.rebelmouse.com)", pool: "content" },
      // Scanners (surging alongside)
      { name: "Censys",               cat: "scanner", weight: 16000, pages: 8, ua: "Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)", pool: "junk", bump: 19 },
      { name: "ZGrab",                cat: "scanner", weight: 11000, pages: 6, ua: "Mozilla/5.0 zgrab/0.x", pool: "junk", bump: 18, first: 14 },
      { name: "Pingdom",              cat: "scanner", weight: 7000,  pages: 6, ua: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)", pool: "junk" },
      { name: "UptimeRobot",          cat: "scanner", weight: 5000,  pages: 4, ua: "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)", pool: "junk" },
      // Spoofed (large, steady)
      { name: "Spoofed Chrome 138",   cat: "spoofed", weight: 40000, pages: 44, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", pool: "junk", bump: 19 },
      { name: "Spoofed Safari 17",    cat: "spoofed", weight: 24000, pages: 38, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", pool: "junk" },
      { name: "Spoofed Firefox",      cat: "spoofed", weight: 16000, pages: 30, ua: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", pool: "junk" },
      // Legitimate traffic (declining into the period end)
      { name: "Googlebot",            cat: "search_indexer", weight: 6000, pages: 40, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Bingbot",              cat: "search_indexer", weight: 2800, pages: 28, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", pool: "content" },
      { name: "AhrefsBot",            cat: "seo_tool", weight: 9000, pages: 40, ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", pool: "content" },
      { name: "facebookexternalhit",  cat: "page_preview", weight: 7000, pages: 18, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", pool: "content" },
      { name: "GPTBot",               cat: "ai_training", weight: 4000, pages: 30, ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", pool: "content" },
      { name: "PerplexityBot",        cat: "ai_search", weight: 1800, pages: 16, ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", pool: "content" },
      { name: "Unclassified",         cat: "unclassified", weight: 22000, pages: 48, ua: "-", pool: "junk", bump: 19 },
    ],
    topPages: {
      baseW: { spoofed:0.22, page_preview:0.04, scraper:0.34, seo_tool:0.05, search_indexer:0.04,
        ai_training:0.02, scanner:0.16, ai_search:0.01, ai_assistant:0.005, ai_agent:0.004, archiver:0.006, unclassified:0.095 },
      fixed: [
        { url: "/api/v1/products", trend: 486, agents: ["Bytespider", "python-requests", "Scrapy"],
          byType: { scraper:41200, spoofed:9800, scanner:6400, unclassified:5200, seo_tool:900,
                    search_indexer:600, page_preview:120, ai_training:200, ai_search:40, ai_assistant:0, ai_agent:0, archiver:20 } },
        { url: "/api/v1/users", trend: 512, agents: ["python-requests", "Bytespider", "Censys"],
          byType: { scraper:28600, scanner:9200, spoofed:7100, unclassified:4400, seo_tool:300,
                    search_indexer:220, page_preview:40, ai_training:80, ai_search:10, ai_assistant:0, ai_agent:0, archiver:0 } },
        { url: "/", trend: 61, agents: ["Spoofed browser", "Censys", "MJ12bot"],
          byType: { spoofed:18400, scraper:9200, scanner:7600, unclassified:3800, page_preview:2100,
                    seo_tool:1400, search_indexer:1600, ai_training:400, ai_search:120, ai_assistant:20, ai_agent:10, archiver:40 } },
        { url: "/wp-includes/wlwmanifest.xml", trend: 743, agents: ["ZGrab", "Censys", "python-requests"],
          byType: { scanner:8900, scraper:5200, spoofed:3100, unclassified:2600, seo_tool:60,
                    search_indexer:20, page_preview:0, ai_training:0, ai_search:0, ai_assistant:0, ai_agent:0, archiver:0 } },
        { url: "/docs/getting-started", trend: -34, agents: ["Googlebot", "AhrefsBot", "facebookexternalhit"],
          byType: { search_indexer:2100, seo_tool:1800, spoofed:1200, scraper:900, page_preview:1400,
                    ai_training:600, scanner:200, ai_search:180, ai_assistant:20, ai_agent:10, archiver:40, unclassified:220 } },
      ],
      gen: [
        { url: "/reference/config", scale: 9000, boost: "scraper" },
        { url: "/reference/cli", scale: 7200, boost: "scraper" },
        { url: "/robots.txt", scale: 5400, boost: "scanner" },
        { url: "/guide/installation", scale: 3200, boost: "spoofed" },
        { url: "/blog/release-notes", scale: 1500, boost: "search_indexer" },
        { url: "/support", scale: 900, boost: "page_preview" },
      ],
    },
  };

  // ---- 4) Quiet low-traffic ----------------------------------------------
  const DATASET_QUIET = {
    key: "quiet",
    label: "Quiet low-traffic",
    sitePill: "myblog.io",
    shape: SHAPE_QUIET,
    pathsContent: [
      "/", "/about", "/archive", "/posts/hello-world", "/posts/on-writing-daily",
      "/posts/a-quiet-year", "/posts/notes-on-gardening", "/rss.xml", "/contact",
      "/posts/books-i-read", "/now",
    ],
    pathsJunk: PATHS_JUNK,
    agents: [
      { name: "Googlebot",            cat: "search_indexer", weight: 1200, pages: 20, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Bingbot",              cat: "search_indexer", weight: 620,  pages: 16, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", pool: "content" },
      { name: "DuckDuckBot",          cat: "search_indexer", weight: 240,  pages: 10, ua: "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", pool: "content" },
      { name: "AhrefsBot",            cat: "seo_tool", weight: 520, pages: 18, ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", pool: "content" },
      { name: "DotBot",               cat: "seo_tool", weight: 210, pages: 12, ua: "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)", pool: "content" },
      { name: "facebookexternalhit",  cat: "page_preview", weight: 380, pages: 12, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", pool: "content" },
      { name: "Twitterbot",           cat: "page_preview", weight: 150, pages: 8, ua: "Twitterbot/1.0", pool: "content" },
      { name: "Spoofed Chrome 138",   cat: "spoofed", weight: 760, pages: 20, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", pool: "junk" },
      { name: "UptimeRobot",          cat: "scanner", weight: 300, pages: 4, ua: "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)", pool: "junk" },
      { name: "Pingdom",              cat: "scanner", weight: 190, pages: 4, ua: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)", pool: "junk" },
      { name: "python-requests",      cat: "scraper", weight: 160, pages: 10, ua: "python-requests/2.32", pool: "junk" },
      { name: "GPTBot",               cat: "ai_training", weight: 220, pages: 14, ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", pool: "content" },
      { name: "ClaudeBot",            cat: "ai_training", weight: 130, pages: 10, ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", pool: "content" },
      { name: "PerplexityBot",        cat: "ai_search", weight: 90, pages: 8, ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", pool: "content" },
      { name: "Unclassified",         cat: "unclassified", weight: 300, pages: 22, ua: "-", pool: "junk" },
      { name: "archive.org_bot",      cat: "archiver", weight: 110, pages: 12, ua: "Mozilla/5.0 (compatible; archive.org_bot; +http://archive.org/details/archive.org_bot)", pool: "content" },
    ],
    topPages: {
      baseW: { spoofed:0.16, page_preview:0.1, scraper:0.05, seo_tool:0.12, search_indexer:0.28,
        ai_training:0.05, scanner:0.06, ai_search:0.02, ai_assistant:0.01, ai_agent:0.005, archiver:0.02, unclassified:0.06 },
      fixed: [
        { url: "/", trend: -4, agents: ["Googlebot", "Spoofed browser", "AhrefsBot"],
          byType: { search_indexer:410, spoofed:230, seo_tool:160, page_preview:120, scraper:60,
                    ai_training:70, scanner:90, ai_search:24, unclassified:80, ai_assistant:6, ai_agent:2, archiver:30 } },
        { url: "/posts/on-writing-daily", trend: 6, agents: ["Googlebot", "facebookexternalhit", "Bingbot"],
          byType: { search_indexer:180, page_preview:90, spoofed:70, seo_tool:60, ai_training:34,
                    scraper:20, ai_search:14, scanner:8, unclassified:22, ai_assistant:2, ai_agent:0, archiver:12 } },
        { url: "/archive", trend: -8, agents: ["Bingbot", "AhrefsBot", "Googlebot"],
          byType: { search_indexer:140, seo_tool:90, spoofed:50, scraper:24, page_preview:20,
                    ai_training:18, scanner:6, ai_search:8, unclassified:16, ai_assistant:0, ai_agent:0, archiver:10 } },
        { url: "/rss.xml", trend: -2, agents: ["Googlebot", "python-requests", "archive.org_bot"],
          byType: { search_indexer:96, scraper:40, seo_tool:30, spoofed:24, ai_training:20,
                    page_preview:10, scanner:4, ai_search:6, unclassified:12, ai_assistant:0, ai_agent:0, archiver:18 } },
        { url: "/about", trend: -6, agents: ["Googlebot", "Spoofed browser", "facebookexternalhit"],
          byType: { search_indexer:80, spoofed:60, page_preview:50, seo_tool:34, scraper:12,
                    ai_training:14, scanner:6, ai_search:6, unclassified:14, ai_assistant:2, ai_agent:0, archiver:6 } },
      ],
      gen: [
        { url: "/posts/hello-world", scale: 320, boost: "search_indexer" },
        { url: "/posts/notes-on-gardening", scale: 220, boost: "page_preview" },
        { url: "/contact", scale: 140, boost: "spoofed" },
        { url: "/now", scale: 90, boost: "search_indexer" },
        { url: "/posts/books-i-read", scale: 70, boost: "ai_training" },
      ],
    },
  };

  // ---- 5) News / publisher ------------------------------------------------
  const DATASET_NEWS = {
    key: "news",
    label: "News / publisher",
    sitePill: "dailychronicle.com",
    shape: SHAPE_NEWS,
    pathsContent: [
      "/", "/world", "/politics", "/business", "/tech", "/sport", "/opinion",
      "/2026/07/breaking-major-policy-shift-announced",
      "/2026/07/markets-rally-on-earnings-surprise",
      "/2026/07/exclusive-interview-with-the-minister",
      "/2026/07/analysis-what-the-new-law-means-for-you",
      "/2026/07/five-things-to-know-this-morning",
      "/newsletter", "/live/election-night", "/video/top-stories",
    ],
    pathsJunk: PATHS_JUNK,
    agents: [
      // Page preview (dominant — heavy social sharing), with a big-story bump
      { name: "facebookexternalhit",  cat: "page_preview", weight: 120000, pages: 26, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", pool: "content", bump: 22 },
      { name: "Twitterbot",           cat: "page_preview", weight: 46000, pages: 22, ua: "Twitterbot/1.0", pool: "content", bump: 22 },
      { name: "Slackbot-LinkExpanding", cat: "page_preview", weight: 20000, pages: 16, ua: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", pool: "content" },
      { name: "WhatsApp",             cat: "page_preview", weight: 18000, pages: 12, ua: "WhatsApp/2.24", pool: "content", bump: 22 },
      { name: "LinkedInBot",          cat: "page_preview", weight: 15000, pages: 10, ua: "LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)", pool: "content" },
      { name: "TelegramBot",          cat: "page_preview", weight: 9000,  pages: 8,  ua: "TelegramBot (like TwitterBot)", pool: "content" },
      // AI Search (publishers are heavily cited)
      { name: "PerplexityBot",        cat: "ai_search", weight: 30000, pages: 22, ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", pool: "content" },
      { name: "OAI-SearchBot",        cat: "ai_search", weight: 25000, pages: 24, ua: "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", pool: "content" },
      { name: "Claude-SearchBot",     cat: "ai_search", weight: 9000,  pages: 16, ua: "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +search@anthropic.com)", pool: "content", first: 12 },
      // Search indexers
      { name: "Googlebot",            cat: "search_indexer", weight: 42000, pages: 40, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Googlebot-News",       cat: "search_indexer", weight: 20000, pages: 34, ua: "Mozilla/5.0 (compatible; Googlebot-News; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Bingbot",              cat: "search_indexer", weight: 18000, pages: 30, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", pool: "content" },
      // AI training
      { name: "GPTBot",               cat: "ai_training", weight: 18000, pages: 38, ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", pool: "content" },
      { name: "ClaudeBot",            cat: "ai_training", weight: 14000, pages: 34, ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", pool: "content" },
      { name: "Amazonbot",            cat: "ai_training", weight: 7000,  pages: 26, ua: "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", pool: "content" },
      // AI assistant
      { name: "ChatGPT-User",         cat: "ai_assistant", weight: 9000, pages: 18, ua: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", pool: "content" },
      // Others
      { name: "Bytespider",           cat: "scraper", weight: 12000, pages: 34, ua: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", pool: "content" },
      { name: "AhrefsBot",            cat: "seo_tool", weight: 8000, pages: 40, ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", pool: "content" },
      { name: "Spoofed Chrome 138",   cat: "spoofed", weight: 25000, pages: 40, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", pool: "junk" },
      { name: "Pingdom",              cat: "scanner", weight: 4000, pages: 6, ua: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)", pool: "junk" },
      { name: "Unclassified",         cat: "unclassified", weight: 15000, pages: 44, ua: "-", pool: "junk" },
      { name: "archive.org_bot",      cat: "archiver", weight: 5000, pages: 28, ua: "Mozilla/5.0 (compatible; archive.org_bot; +http://archive.org/details/archive.org_bot)", pool: "content" },
    ],
    topPages: {
      baseW: { spoofed:0.1, page_preview:0.34, scraper:0.05, seo_tool:0.03, search_indexer:0.2,
        ai_training:0.07, scanner:0.01, ai_search:0.12, ai_assistant:0.03, ai_agent:0.004, archiver:0.02, unclassified:0.05 },
      fixed: [
        { url: "/2026/07/breaking-major-policy-shift-announced", trend: 318, agents: ["facebookexternalhit", "Twitterbot", "PerplexityBot"],
          byType: { page_preview:38600, ai_search:12400, search_indexer:9200, ai_training:4100, spoofed:3400,
                    scraper:1800, ai_assistant:1600, seo_tool:600, scanner:120, ai_agent:80, archiver:400, unclassified:900 } },
        { url: "/2026/07/markets-rally-on-earnings-surprise", trend: 142, agents: ["facebookexternalhit", "OAI-SearchBot", "Googlebot-News"],
          byType: { page_preview:19800, ai_search:8600, search_indexer:7400, ai_training:3200, spoofed:2100,
                    scraper:1200, ai_assistant:900, seo_tool:400, scanner:60, ai_agent:40, archiver:220, unclassified:520 } },
        { url: "/", trend: 22, agents: ["Googlebot", "Spoofed browser", "facebookexternalhit"],
          byType: { search_indexer:14200, page_preview:11800, spoofed:6400, ai_training:3800, ai_search:3100,
                    scraper:2600, seo_tool:1900, ai_assistant:700, scanner:300, ai_agent:60, archiver:600, unclassified:1100 } },
        { url: "/2026/07/exclusive-interview-with-the-minister", trend: 96, agents: ["Twitterbot", "WhatsApp", "PerplexityBot"],
          byType: { page_preview:16400, ai_search:6200, search_indexer:4800, ai_training:2100, spoofed:1600,
                    scraper:900, ai_assistant:1100, seo_tool:300, scanner:40, ai_agent:30, archiver:160, unclassified:380 } },
        { url: "/politics", trend: 34, agents: ["Googlebot-News", "facebookexternalhit", "Bingbot"],
          byType: { search_indexer:9600, page_preview:7200, ai_search:2800, spoofed:2400, ai_training:1900,
                    scraper:1400, seo_tool:800, ai_assistant:400, scanner:120, ai_agent:20, archiver:300, unclassified:600 } },
      ],
      gen: [
        { url: "/2026/07/analysis-what-the-new-law-means-for-you", scale: 12000, boost: "ai_search" },
        { url: "/world", scale: 9000, boost: "page_preview" },
        { url: "/business", scale: 7500, boost: "search_indexer" },
        { url: "/2026/07/five-things-to-know-this-morning", scale: 6000, boost: "page_preview" },
        { url: "/tech", scale: 5000, boost: "ai_training" },
        { url: "/live/election-night", scale: 4200, boost: "page_preview" },
      ],
    },
  };

  // ---- 6) E-commerce ------------------------------------------------------
  const DATASET_ECOMMERCE = {
    key: "ecommerce",
    label: "E-commerce",
    sitePill: "shopmart.com",
    shape: SHAPE_ECOMMERCE,
    pathsContent: [
      "/", "/category/electronics", "/category/home-kitchen", "/category/fashion",
      "/product/wireless-earbuds-pro", "/product/4k-action-camera",
      "/product/robot-vacuum-x2", "/product/ergonomic-office-chair",
      "/deals", "/deals/summer-sale", "/cart", "/checkout", "/search?q=laptop",
      "/account/orders", "/gift-cards",
    ],
    pathsJunk: PATHS_JUNK,
    agents: [
      // SEO tools (dominant on product/category pages)
      { name: "AhrefsBot",            cat: "seo_tool", weight: 42000, pages: 48, ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", pool: "content" },
      { name: "SemrushBot",           cat: "seo_tool", weight: 31000, pages: 40, ua: "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)", pool: "content" },
      { name: "DotBot",               cat: "seo_tool", weight: 13000, pages: 24, ua: "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)", pool: "content" },
      { name: "MJ12bot",              cat: "seo_tool", weight: 15000, pages: 30, ua: "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)", pool: "content" },
      // Search indexers
      { name: "Googlebot",            cat: "search_indexer", weight: 36000, pages: 40, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", pool: "content" },
      { name: "Bingbot",              cat: "search_indexer", weight: 18000, pages: 34, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", pool: "content" },
      { name: "YandexBot",            cat: "search_indexer", weight: 8000,  pages: 24, ua: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", pool: "content" },
      { name: "AdsBot-Google",        cat: "search_indexer", weight: 9000,  pages: 28, ua: "AdsBot-Google (+http://www.google.com/adsbot.html)", pool: "content" },
      // Spoofed (price scrapers disguised as browsers) — surge into the sale
      { name: "Spoofed Chrome 138",   cat: "spoofed", weight: 50000, pages: 44, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", pool: "junk", bump: 25 },
      { name: "Spoofed Safari 17",    cat: "spoofed", weight: 30000, pages: 38, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", pool: "junk", bump: 25 },
      // Scrapers (price/inventory)
      { name: "Bytespider",           cat: "scraper", weight: 20000, pages: 40, ua: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", pool: "content", bump: 25 },
      { name: "PriceSpider",          cat: "scraper", weight: 15000, pages: 30, ua: "Mozilla/5.0 (compatible; PriceSpiderBot/1.0)", pool: "content", bump: 24 },
      { name: "python-requests",      cat: "scraper", weight: 9000,  pages: 18, ua: "python-requests/2.32", pool: "junk", bump: 25 },
      // Social + AI
      { name: "facebookexternalhit",  cat: "page_preview", weight: 15000, pages: 20, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", pool: "content" },
      { name: "Pinterestbot",         cat: "page_preview", weight: 8000,  pages: 16, ua: "Mozilla/5.0 (compatible; Pinterestbot/1.0; +https://www.pinterest.com/bot.html)", pool: "content" },
      { name: "PerplexityBot",        cat: "ai_search", weight: 10000, pages: 20, ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", pool: "content", first: 10 },
      { name: "OAI-SearchBot",        cat: "ai_search", weight: 8000,  pages: 22, ua: "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", pool: "content" },
      { name: "GPTBot",               cat: "ai_training", weight: 6000, pages: 30, ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", pool: "content" },
      { name: "ChatGPT-Agent",        cat: "ai_agent", weight: 3500, pages: 12, ua: "Mozilla/5.0 (compatible; ChatGPT-Agent/1.0; +https://openai.com/agent)", pool: "content", first: 21 },
      // Ops + noise
      { name: "Pingdom",              cat: "scanner", weight: 4000, pages: 6, ua: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)", pool: "junk" },
      { name: "Unclassified",         cat: "unclassified", weight: 18000, pages: 46, ua: "-", pool: "junk", bump: 25 },
    ],
    topPages: {
      baseW: { spoofed:0.24, page_preview:0.06, scraper:0.14, seo_tool:0.22, search_indexer:0.16,
        ai_training:0.02, scanner:0.02, ai_search:0.04, ai_assistant:0.008, ai_agent:0.006, archiver:0.004, unclassified:0.05 },
      fixed: [
        { url: "/product/wireless-earbuds-pro", trend: 174, agents: ["AhrefsBot", "Spoofed browser", "PriceSpider"],
          byType: { seo_tool:12400, spoofed:9800, scraper:6200, search_indexer:5400, page_preview:1200,
                    ai_search:1600, ai_training:700, ai_agent:300, scanner:120, ai_assistant:180, archiver:40, unclassified:1400 } },
        { url: "/category/electronics", trend: 96, agents: ["SemrushBot", "Googlebot", "AhrefsBot"],
          byType: { seo_tool:14800, search_indexer:8600, spoofed:6100, scraper:3800, page_preview:900,
                    ai_search:1200, ai_training:600, scanner:80, ai_agent:120, ai_assistant:90, archiver:30, unclassified:1100 } },
        { url: "/deals/summer-sale", trend: 421, agents: ["Spoofed browser", "Bytespider", "AdsBot-Google"],
          byType: { spoofed:16200, scraper:8400, seo_tool:5600, search_indexer:4200, page_preview:2100,
                    ai_search:1800, ai_agent:600, ai_training:400, scanner:60, ai_assistant:240, archiver:20, unclassified:2200 } },
        { url: "/", trend: 58, agents: ["Googlebot", "AhrefsBot", "Spoofed browser"],
          byType: { search_indexer:9800, seo_tool:8200, spoofed:7600, page_preview:2400, scraper:2600,
                    ai_search:1400, ai_training:800, scanner:200, ai_agent:100, ai_assistant:120, archiver:60, unclassified:1300 } },
        { url: "/product/robot-vacuum-x2", trend: 132, agents: ["PriceSpider", "Spoofed browser", "SemrushBot"],
          byType: { scraper:7200, spoofed:6400, seo_tool:5100, search_indexer:3200, ai_search:1100,
                    page_preview:600, ai_training:400, ai_agent:200, scanner:40, ai_assistant:80, archiver:10, unclassified:900 } },
      ],
      gen: [
        { url: "/category/home-kitchen", scale: 11000, boost: "seo_tool" },
        { url: "/product/4k-action-camera", scale: 9000, boost: "spoofed" },
        { url: "/category/fashion", scale: 7500, boost: "search_indexer" },
        { url: "/product/ergonomic-office-chair", scale: 6000, boost: "scraper" },
        { url: "/deals", scale: 5000, boost: "spoofed" },
        { url: "/search?q=laptop", scale: 3200, boost: "seo_tool" },
      ],
    },
  };

  const DATASETS = [
    DATASET_SUPERTAB,
    DATASET_AI_SURGE,
    DATASET_SCRAPER_SPIKE,
    DATASET_QUIET,
    DATASET_NEWS,
    DATASET_ECOMMERCE,
  ];

  // ---- Resolve the active dataset -----------------------------------------
  const LS_DATASET_KEY = "supertab_dash_dataset";
  function resolveActiveKey() {
    let key = null;
    try {
      const u = new URL(window.location.href);
      key = u.searchParams.get("dataset");
    } catch (e) { /* ignore */ }
    if (!key) {
      try { key = localStorage.getItem(LS_DATASET_KEY); } catch (e) { /* ignore */ }
    }
    if (key && DATASETS.some((d) => d.key === key)) return key;
    return DATASETS[0].key;
  }

  const activeKey = resolveActiveKey();
  const active = DATASETS.find((d) => d.key === activeKey) || DATASETS[0];

  window.DATASETS = DATASETS;
  window.ACTIVE_DATASET = active;
  window.DASHBOARD_DATA = buildDashboardData(active);
})();
