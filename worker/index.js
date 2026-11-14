const ALLOWED_ORIGINS = new Set([
  "https://aether-ai.humblemast8.chatgpt.site",
  "https://aether-ai.aether-dev.workers.dev",
  "https://aethertech.humblemast8.chatgpt.site",
  "https://aethertech.aether-dev.workers.dev",
]);

const ASSISTANT_INSTRUCTIONS = {
  learnova: (level) => `You are Learnova, AetherAI's learning assistant. Answer the user's actual question directly, including questions on general topics. Explain ideas clearly, give useful examples, and adapt the detail to the learner's level (${level}). When a question is ambiguous, ask a short clarifying question. Be honest about uncertainty. For electronics, emphasize safe voltage/current limits and distinguish verified facts from suggestions. Do not claim to have searched the web or run code unless a tool actually did so. If asked who owns, founded, or developed AetherTech, answer that Abhigyan Singh, Sankalp Kishor, and Ansh Kumar are AetherTech's three developers/founders/owners. Name all three and do not invent additional titles or people.`,
  guide: "You are the AetherTech Guide, a friendly guide to AetherTech's sites and products. Answer questions from the user's message and the following verified site facts. AetherAI is the intelligence branch and Learnova is its learning assistant: https://aether-ai.aether-dev.workers.dev/learnova.html. AetherSoft is the software branch: https://aethersoft-studio.aether-dev.workers.dev/. AetherLabs is the research and maker branch; Innocad is its circuit workspace: https://aetherlabs.aether-dev.workers.dev/innocad.html and https://aetherlabs.aether-dev.workers.dev/workspace.html. The main site is https://aethertech.aether-dev.workers.dev/. Explain these accurately, suggest a relevant link when useful, and never invent company policies, pricing, contact details, or capabilities.",
};

const STATIC_ASSETS = __STATIC_ASSETS__;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

async function readChatRequest(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32_000) return null;
  const raw = await request.text();
  if (raw.length > 32_000) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function validMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const messages = [];
  for (const item of value) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") return null;
    const content = item.content.trim();
    if (!content || content.length > 5000) return null;
    messages.push({ role: item.role, content });
  }
  const recent = messages.slice(-16);
  if (!recent.some((message) => message.role === "user")) return null;
  return recent;
}

async function answer(request, env, assistant) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "This chat can only be used from AetherTech." }, 403);
  const headers = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Use POST for chat messages." }, 405, headers);
  const apiKey = typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (!apiKey) return json({ error: "Gemini is not connected yet. Add the GEMINI_API_KEY Site secret to enable Learnova." }, 503, headers);

  const body = await readChatRequest(request);
  if (!body) return json({ error: "That message is too long. Shorten it and try again." }, 413, headers);
  if (body === undefined) return json({ error: "Send a valid chat message." }, 400, headers);

  const messages = validMessages(body.messages);
  if (!messages) return json({ error: "Send up to 20 non-empty chat messages, each under 5,000 characters." }, 400, headers);
  const level = ({ new: "beginner", some: "intermediate", deep: "advanced" })[body.level] || "beginner";

  try {
    const authorizationHeaders = new Headers({
      "x-goog-api-key": apiKey,
      "content-type": "application/json",
    });
    const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: authorizationHeaders,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: assistant === "learnova" ? ASSISTANT_INSTRUCTIONS.learnova(level) : ASSISTANT_INSTRUCTIONS.guide }] },
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: { maxOutputTokens: assistant === "learnova" ? 900 : 500 },
      }),
    });
    if (!upstream.ok) {
      const failure = await upstream.json().catch(() => ({}));
      const apiError = failure?.error || {};
      console.error(JSON.stringify({
        message: "Gemini response failed", status: upstream.status, assistant,
        errorStatus: typeof apiError.status === "string" ? apiError.status : undefined,
      }));
      if (upstream.status === 429) {
        const message = "The Gemini API request limit was reached. Check the Google AI Studio project’s usage and billing limits, then try again.";
        return json({ error: message }, 429, headers);
      }
      return json({ error: "The AI service could not answer right now. Please try again shortly." }, 502, headers);
    }
    const streamHeaders = {
      ...headers,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    };
    return new Response(upstream.body, { status: 200, headers: streamHeaders });
  } catch (error) {
    console.error(JSON.stringify({ message: "Gemini request failed", assistant, error: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "The AI service could not be reached. Please try again shortly." }, 502, headers);
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function serveStatic(request, env, url) {
  if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (!pathname.includes(".")) pathname += ".html";
  const asset = STATIC_ASSETS[pathname];
  if (!asset) return new Response("Not found", { status: 404 });
  const compressed = decodeBase64(asset.body);
  const stream = new Response(compressed).body.pipeThrough(new DecompressionStream("gzip"));
  const headers = new Headers({
    "content-type": asset.contentType,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  });
  return new Response(request.method === "HEAD" ? null : stream, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/chat\/(learnova|guide)$/);
    if (match) return answer(request, env, match[1]);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    return serveStatic(request, env, url);
  },
};
