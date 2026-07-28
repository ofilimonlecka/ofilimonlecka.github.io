/*
 * Supertab Connect — Bot Classification Dashboard (prototype)
 * ------------------------------------------------------------
 * MOCK / SAMPLE DATA. None of this is real traffic. It is generated
 * deterministically (seeded) so the dashboard looks the same on every
 * reload. Numbers are shaped to resemble the real Connect "Agents & Bots"
 * view but are entirely synthetic.
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

  // ---- Categories ---------------------------------------------------------
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

  // ---- Date range: 30 days ending 2026-07-28 ------------------------------
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

  // Overall daily "shape" of total traffic across the period (0..1).
  // Ramps up from launch, plateaus, dips mid-period, climbs to a peak, tapers.
  const SHAPE = [
    0.03, 0.35, 0.55, 0.60, 0.58, 0.62, 0.66, 0.72, 0.66, 0.58,
    0.50, 0.47, 0.52, 0.56, 0.60, 0.68, 0.78, 0.84, 0.80, 0.78,
    0.82, 0.86, 0.84, 0.88, 0.93, 0.97, 1.00, 0.90, 0.72, 0.55,
  ];

  // Diurnal + weekday patterns for the request-pattern heatmaps.
  const HOUR_BASE = [
    0.30,0.25,0.20,0.20,0.25,0.35, 0.50,0.65,0.80,0.85,0.80,0.82,
    0.85,0.80,0.82,0.85,0.88,0.90, 1.00,0.95,0.80,0.65,0.50,0.40,
  ];
  const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DAY_LONG = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const DAY_BASE = [1.0, 0.85, 0.70, 0.65, 0.60, 0.50, 0.55];

  const LAST_SEEN_POOL = ["just now","17 min ago","36 min ago","1h ago","3h ago","12h ago",
    "13h ago","15h ago","22h ago","1d ago","3d ago","4d ago","6d ago","1w ago","2w ago"];

  // Path pools (grounded in the real Connect exports).
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

  // ---- Agent roster -------------------------------------------------------
  // weight = target total visits across the 30-day window.
  const AGENTS = [
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
  ];

  // ---- Builders -----------------------------------------------------------
  function buildDaily(rng, weight, bumpIdx, firstSeen) {
    firstSeen = firstSeen || 0;
    const raw = [];
    for (let i = 0; i < DAYS; i++) {
      if (i < firstSeen) { raw.push(0); continue; } // not yet seen
      let s = SHAPE[i];
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

  function buildPages(rng, agent, total) {
    const pool = (agent.pool === "junk"
      ? PATHS_JUNK.concat(PATHS_CONTENT.slice(0, 6))
      : PATHS_CONTENT.concat(PATHS_JUNK.slice(0, 6))
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

  // ---- Assemble -----------------------------------------------------------
  const agents = AGENTS.map((a, idx) => {
    const rng = mulberry32(hashString(a.name) ^ 0x9e3779b9);
    const daily = buildDaily(rng, a.weight, a.bump, a.first);
    const total = daily.reduce((x, y) => x + y, 0);
    let topIdx = 0;
    for (let i = 1; i < daily.length; i++) if (daily[i] > daily[topIdx]) topIdx = i;
    const weekly = Math.max(50, Math.round((total / DAYS) * 7));
    const heatmap = buildHeatmap(rng, weekly);
    const stats = heatmapStats(heatmap);
    const pages = buildPages(rng, a, total);
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

  window.DASHBOARD_DATA = {
    categories: CATEGORIES,
    categoryByKey: CATEGORY_BY_KEY,
    dates,
    dayLabels: DAY_LABELS,
    agents,
    categorySeries,
    grandDaily,
    grandTotal,
  };
})();
