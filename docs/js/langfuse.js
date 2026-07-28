/*
 * Supertab Connect dashboard — Langfuse ingestion (browser BYO-key).
 *
 * Posts a trace + generation for each AI summary, and a score for each
 * thumbs up/down. Uses the /api/public/ingestion batch endpoint with HTTP
 * Basic auth (public:secret). Both keys live in localStorage — acceptable
 * for a personal prototype only; a production app would keep the secret key
 * server-side and use the public-key-only browser client for scores.
 */
(function () {
  "use strict";
  const LS_KEY = "supertab_dash_settings";

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function cfg() {
    const s = getSettings();
    return {
      pk: (s.lfPublicKey || "").trim(),
      sk: (s.lfSecretKey || "").trim(),
      host: (s.lfHost || "https://cloud.langfuse.com").trim().replace(/\/+$/, ""),
    };
  }
  function isConfigured() { const c = cfg(); return !!(c.pk && c.sk && c.host); }
  function uuid() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : "id-" + Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
  }

  function authHeader() { const c = cfg(); return "Basic " + btoa(c.pk + ":" + c.sk); }

  // --- Prompt management -------------------------------------------------
  // Fetch a versioned prompt by name (defaults to the "production" label).
  async function getPrompt(name, opts) {
    if (!isConfigured()) throw new Error("Langfuse is not configured");
    opts = opts || {};
    const c = cfg();
    const q = (opts.version != null)
      ? "?version=" + encodeURIComponent(opts.version)
      : "?label=" + encodeURIComponent(opts.label || "production");
    const res = await fetch(c.host + "/api/public/v2/prompts/" + encodeURIComponent(name) + q, {
      headers: { "authorization": authHeader() },
      cache: "no-store", // always fetch the current label/version, never a stale browser copy
    });
    let data = null; try { data = await res.json(); } catch (e) { /* */ }
    if (res.status === 404) return null; // no such prompt/label yet
    if (!res.ok) { const m = (data && (data.message || data.error)) || ("HTTP " + res.status); throw new Error(typeof m === "string" ? m : JSON.stringify(m)); }
    return {
      name: data.name, version: data.version, type: data.type, labels: data.labels || [],
      text: (typeof data.prompt === "string") ? data.prompt : JSON.stringify(data.prompt),
    };
  }

  // Create a prompt (or a new version if the name exists). Text type.
  async function createPrompt(o) {
    if (!isConfigured()) throw new Error("Langfuse is not configured");
    const c = cfg();
    const body = { name: o.name, type: o.type || "text", prompt: o.prompt, labels: o.labels || ["production"] };
    if (o.config) body.config = o.config;
    if (o.commitMessage) body.commitMessage = o.commitMessage;
    const res = await fetch(c.host + "/api/public/v2/prompts", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": authHeader() },
      body: JSON.stringify(body),
    });
    let data = null; try { data = await res.json(); } catch (e) { /* */ }
    if (!res.ok) { const m = (data && (data.message || data.error)) || ("HTTP " + res.status); throw new Error(typeof m === "string" ? m : JSON.stringify(m)); }
    return data; // includes the new version number
  }

  async function ingest(batch) {
    const c = cfg();
    const res = await fetch(c.host + "/api/public/ingestion", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Basic " + btoa(c.pk + ":" + c.sk),
      },
      body: JSON.stringify({ batch }),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 207 may still be fine */ }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || ("HTTP " + res.status);
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    // 207 Multi-Status: per-event errors surface in `errors`
    if (data && Array.isArray(data.errors) && data.errors.length) {
      const e0 = data.errors[0];
      throw new Error("Langfuse rejected an event: " + (e0.message || JSON.stringify(e0)));
    }
    return data;
  }

  // Log one AI summary as a trace + nested generation. Returns { traceId, generationId }.
  async function logSummary(o) {
    if (!isConfigured()) return null;
    const traceId = uuid(), genId = uuid(), now = new Date().toISOString();
    const u = o.usage || {};
    const usage = (u.input_tokens != null || u.output_tokens != null) ? {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      total: (u.input_tokens || 0) + (u.output_tokens || 0),
      unit: "TOKENS",
    } : undefined;
    const batch = [
      {
        id: uuid(), timestamp: now, type: "trace-create",
        body: {
          id: traceId, name: "dashboard-summary", timestamp: o.startTime || now,
          input: o.traceInput, output: o.output,
          metadata: o.metadata || {}, tags: ["dashboard", "ai-summary"],
        },
      },
      {
        id: uuid(), timestamp: now, type: "generation-create",
        body: {
          id: genId, traceId: traceId, name: "summary-generation",
          startTime: o.startTime, endTime: o.endTime,
          model: o.model, modelParameters: o.modelParameters || {},
          input: o.genInput, output: o.output, usage: usage,
          metadata: o.metadata || {}, level: "DEFAULT",
          promptName: o.promptName, promptVersion: o.promptVersion, // links to a Langfuse-managed prompt version
        },
      },
    ];
    await ingest(batch);
    return { traceId: traceId, generationId: genId };
  }

  // Post a score against a trace (thumbs up/down → BOOLEAN 1/0).
  async function postScore(o) {
    if (!isConfigured()) throw new Error("Langfuse is not configured");
    const batch = [{
      id: uuid(), timestamp: new Date().toISOString(), type: "score-create",
      body: {
        id: uuid(), traceId: o.traceId, name: o.name || "user-feedback",
        value: o.value, dataType: o.dataType || "BOOLEAN", comment: o.comment,
      },
    }];
    await ingest(batch);
  }

  window.Langfuse = {
    isConfigured: isConfigured, logSummary: logSummary, postScore: postScore,
    getPrompt: getPrompt, createPrompt: createPrompt, host: () => cfg().host,
  };
})();
