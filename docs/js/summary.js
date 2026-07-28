/* Supertab Connect dashboard — AI Summary feature (Anthropic, browser BYO-key) */
(function () {
  "use strict";
  const el = (id) => document.getElementById(id);
  const LS_KEY = "supertab_dash_settings";

  const MODELS = [
    { id: "claude-opus-5", label: "Claude Opus 5 — most capable" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 — balanced" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest / cheapest" },
  ];
  const DEFAULT_MODEL = "claude-opus-5";

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function setSettings(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  // ---- Minimal markdown → HTML ------------------------------------------
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\*)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }
  function mdToHtml(md) {
    const lines = md.replace(/\r/g, "").split("\n");
    let html = "", list = null;
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    for (let raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); continue; }
      let m;
      if ((m = line.match(/^#{1,4}\s+(.*)$/))) { closeList(); html += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
        if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
        html += `<li>${inline(m[1])}</li>`;
      } else { closeList(); html += `<p>${inline(line)}</p>`; }
    }
    closeList();
    return html;
  }

  // ---- Settings modal ---------------------------------------------------
  function initModelSelect() {
    const sel = el("set-model");
    if (sel.options.length) return;
    MODELS.forEach((m) => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.label; sel.appendChild(o); });
  }
  function openSettings() {
    initModelSelect();
    const s = getSettings();
    el("set-key").value = s.apiKey || "";
    el("set-model").value = s.model || DEFAULT_MODEL;
    el("set-lf-pk").value = s.lfPublicKey || "";
    el("set-lf-sk").value = s.lfSecretKey || "";
    el("set-lf-host").value = s.lfHost || "https://cloud.langfuse.com";
    el("settings-modal").classList.add("open");
    el("settings-modal").setAttribute("aria-hidden", "false");
    el("settings-scrim").classList.add("open");
  }
  function closeSettings() {
    el("settings-modal").classList.remove("open");
    el("settings-modal").setAttribute("aria-hidden", "true");
    el("settings-scrim").classList.remove("open");
  }
  function saveSettings() {
    const prev = getSettings();
    setSettings(Object.assign({}, prev, {
      apiKey: el("set-key").value.trim(),
      model: el("set-model").value,
      lfPublicKey: el("set-lf-pk").value.trim(),
      lfSecretKey: el("set-lf-sk").value.trim(),
      lfHost: el("set-lf-host").value.trim() || "https://cloud.langfuse.com",
    }));
    closeSettings();
  }

  // ---- Prompt ------------------------------------------------------------
  const SYSTEM = [
    "You are a senior data analyst for the Supertab Connect bot-classification dashboard.",
    "You are given a JSON snapshot of the metrics currently on screen. All figures are synthetic sample data for a prototype.",
    "Write a crisp executive summary for a product/growth reader. Requirements:",
    "- Lead with the headline: total agent & bot visits for the period and the trend.",
    "- Call out the 2-3 dominant categories with their share.",
    "- Highlight notable AI-related activity (AI Training / Search / Assistant / Agent) and any brand-new agents that appeared in the period.",
    "- Mention one or two standout pages if relevant.",
    "Be specific with numbers. Use short paragraphs or bullet points, about 150 words max.",
    "Do not include internal or system XML tags in your response.",
  ].join("\n");

  function buildMessages() {
    const snap = window.DashboardAPI.snapshot();
    const user = "Dashboard snapshot (" + snap.period_label + "):\n\n```json\n" +
      JSON.stringify(snap, null, 2) + "\n```\n\nWrite the summary.";
    return { snapshot: snap, messages: [{ role: "user", content: user }] };
  }

  // ---- API call ----------------------------------------------------------
  async function callClaude(settings, messages) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        max_tokens: 2000,
        thinking: { type: "disabled" },
        system: SYSTEM,
        messages: messages,
      }),
    });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error("HTTP " + res.status + " (unparseable response)"); }
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    return data;
  }

  // ---- Panel rendering ---------------------------------------------------
  function showPanel() { el("summary-card").hidden = false; el("summary-card").scrollIntoView({ behavior: "smooth", block: "start" }); }
  function setLoading() {
    el("summary-body").innerHTML = '<div class="summary-loading"><span class="spinner"></span> Asking Claude to summarize the current view…</div>';
    el("summary-meta").innerHTML = "";
    el("summary-regen").disabled = true;
  }
  function setError(msg) {
    el("summary-body").innerHTML = '<div class="summary-error">⚠️ ' + esc(msg) + '<br><span class="muted">Check your API key in Settings and try again.</span></div>';
    el("summary-meta").innerHTML = "";
    el("summary-regen").disabled = false;
  }
  function renderSummary(text, meta) {
    el("summary-body").innerHTML = mdToHtml(text);
    const u = meta.usage || {};
    const tok = (u.input_tokens != null) ? `${u.input_tokens} in / ${u.output_tokens} out tokens · ` : "";
    el("summary-meta").innerHTML = `<span>${esc(meta.model || "")} · ${tok}${meta.latency} ms</span>`;
    el("summary-regen").disabled = false;
  }

  // ---- Langfuse logging + feedback --------------------------------------
  let lastTraceId = null;
  function fbEl() { return el("summary-feedback"); }
  async function logToLangfuse(built, data, text, timing) {
    lastTraceId = null;
    if (!window.Langfuse || !window.Langfuse.isConfigured()) {
      fbEl().innerHTML = '<span class="fb-hint">💡 Add Langfuse keys in <a href="#" id="fb-settings">Settings</a> to trace this call and rate it — the on-ramp to evals.</span>';
      const s = el("fb-settings"); if (s) s.addEventListener("click", (e) => { e.preventDefault(); openSettings(); });
      return;
    }
    fbEl().innerHTML = '<span class="fb-hint"><span class="spinner"></span> Logging trace to Langfuse…</span>';
    try {
      const res = await window.Langfuse.logSummary({
        traceInput: built.snapshot,
        genInput: { system: SYSTEM, messages: built.messages },
        output: text,
        model: data.model,
        usage: data.usage,
        modelParameters: { max_tokens: 2000, thinking: "disabled" },
        startTime: timing.startTime,
        endTime: timing.endTime,
        metadata: { period: built.snapshot.period_label, prompt_version: "v1-local", latency_ms: timing.latency },
      });
      lastTraceId = res && res.traceId;
      renderFeedback();
    } catch (e) {
      fbEl().innerHTML = '<span class="fb-hint fb-warn">⚠️ Langfuse logging failed: ' + esc(e.message || String(e)) + "</span>";
    }
  }
  function renderFeedback() {
    fbEl().innerHTML =
      '<span class="fb-q">Was this summary useful?</span>' +
      '<button class="fb-btn" data-v="1">👍 Helpful</button>' +
      '<button class="fb-btn" data-v="0">👎 Not helpful</button>' +
      '<span class="fb-status" id="fb-status"></span>';
    fbEl().querySelectorAll(".fb-btn").forEach((b) =>
      b.addEventListener("click", () => sendScore(Number(b.dataset.v))));
  }
  async function sendScore(value) {
    const status = el("fb-status");
    if (status) status.textContent = "Sending…";
    fbEl().querySelectorAll(".fb-btn").forEach((b) => (b.disabled = true));
    try {
      await window.Langfuse.postScore({ traceId: lastTraceId, value: value, name: "user-feedback", dataType: "BOOLEAN" });
      fbEl().innerHTML = '<span class="fb-done">✓ Feedback logged to Langfuse (' + (value ? "👍 helpful" : "👎 not helpful") + ")</span>";
    } catch (e) {
      if (status) status.textContent = "⚠️ " + (e.message || String(e));
      fbEl().querySelectorAll(".fb-btn").forEach((b) => (b.disabled = false));
    }
  }

  let inFlight = false;
  async function summarize() {
    if (inFlight) return;
    const settings = getSettings();
    if (!settings.apiKey) { openSettings(); return; }
    showPanel();
    setLoading();
    fbEl().innerHTML = "";
    inFlight = true;
    const built = buildMessages();
    const startTime = new Date().toISOString();
    const t0 = performance.now();
    try {
      const data = await callClaude(settings, built.messages);
      const endTime = new Date().toISOString();
      const latency = Math.round(performance.now() - t0);
      if (data.stop_reason === "refusal") { setError("The model declined to respond to this request."); return; }
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      renderSummary(text || "(empty response)", { model: data.model, usage: data.usage, latency });
      logToLangfuse(built, data, text || "(empty response)", { startTime: startTime, endTime: endTime, latency: latency });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      inFlight = false;
    }
  }

  // ---- Wiring ------------------------------------------------------------
  el("btn-summary").addEventListener("click", summarize);
  el("summary-regen").addEventListener("click", summarize);
  el("summary-close").addEventListener("click", () => { el("summary-card").hidden = true; });
  el("nav-settings").addEventListener("click", (e) => { e.preventDefault(); openSettings(); });
  el("settings-close").addEventListener("click", closeSettings);
  el("settings-cancel").addEventListener("click", closeSettings);
  el("settings-scrim").addEventListener("click", closeSettings);
  el("settings-save").addEventListener("click", saveSettings);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });
})();
