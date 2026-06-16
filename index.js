/* =====================================================================
   HOMEBREW BRAIN — CLOUDFLARE WORKER
   Replaces the Express server. The shared memory lives in a D1
   database (Cloudflare's free SQLite) — it persists forever and
   the app never sleeps. No external AI, no API keys.
   ===================================================================== */

const MAX_FACTS = 5000;
const MAX_Q_LEN = 200;
const MAX_A_LEN = 500;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---- GET /api/memory : everyone downloads the shared brain ---- */
    if (url.pathname === "/api/memory" && request.method === "GET") {
      const { results } = await env.DB
        .prepare("SELECT q, a FROM facts ORDER BY taught_at")
        .all();
      return json({ facts: results, count: results.length });
    }

    /* ---- POST /api/teach : anyone can teach it ---- */
    if (url.pathname === "/api/teach" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid JSON" }, 400);
      }
      let { q, a } = body || {};
      if (typeof q !== "string" || typeof a !== "string") {
        return json({ ok: false, error: "q and a must be strings" }, 400);
      }
      q = q.trim().slice(0, MAX_Q_LEN);
      a = a.trim().slice(0, MAX_A_LEN);
      if (!q || !a) {
        return json({ ok: false, error: "empty q or a" }, 400);
      }

      const qLower = q.toLowerCase();
      const existing = await env.DB
        .prepare("SELECT 1 FROM facts WHERE q_lower = ?1")
        .bind(qLower)
        .first();

      if (!existing) {
        const row = await env.DB
          .prepare("SELECT COUNT(*) AS c FROM facts")
          .first();
        if (row.c >= MAX_FACTS) {
          return json({ ok: false, error: "brain is full" }, 403);
        }
      }

      // Insert, or update the answer if the same question was taught before
      await env.DB
        .prepare(
          `INSERT INTO facts (q_lower, q, a, taught_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(q_lower) DO UPDATE SET a = ?3, taught_at = ?4`
        )
        .bind(qLower, q, a, new Date().toISOString())
        .run();

      return json({ ok: true });
    }

    /* ---- POST /api/forget : admin only ----
       Only works if YOU set an ADMIN_SECRET on the Worker:
         npx wrangler secret put ADMIN_SECRET
       Otherwise it stays disabled. */
    if (url.pathname === "/api/forget" && request.method === "POST") {
      if (!env.ADMIN_SECRET) {
        return json({ ok: false, error: "forget is disabled" }, 403);
      }
      if (request.headers.get("x-admin-secret") !== env.ADMIN_SECRET) {
        return json({ ok: false, error: "wrong secret" }, 401);
      }
      await env.DB.prepare("DELETE FROM facts").run();
      return json({ ok: true });
    }

    /* ---- POST /api/ai : the digestive system ----
       Runs an open-source Llama model on Cloudflare's GPUs (Workers AI).
       Called only when the homemade brain stages can't answer.
       Free daily allowance; no API key — bound to your account. */
    if (url.pathname === "/api/ai" && request.method === "POST") {
      if (!env.AI) {
        return json({ ok: false, error: "AI not enabled" }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid JSON" }, 400);
      }
      const q = String(body?.q || "").trim().slice(0, 500);
      if (!q) return json({ ok: false, error: "empty question" }, 400);
      const context = String(body?.context || "").trim().slice(0, 1500);

      try {
        const messages = [
          {
            role: "system",
            content:
              "You are Homebrew Brain, a friendly chatbot on a homemade website. " +
              "Answer in 1-3 short sentences, plainly and honestly. " +
              "If you genuinely don't know, say so." +
              (context ? " You may use this background info if relevant: " + context : ""),
          },
          { role: "user", content: q },
        ];
        const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages,
          max_tokens: 220,
        });
        const answer = (r && r.response ? String(r.response) : "").trim();
        if (!answer) return json({ ok: false, error: "no answer" }, 502);
        return json({ ok: true, answer });
      } catch (e) {
        // quota exhausted or model unavailable — the frontend falls back
        return json({ ok: false, error: "ai unavailable" }, 503);
      }
    }

    /* ---- everything else: serve the chatbot frontend ---- */
    return env.ASSETS.fetch(request);
  },
};
