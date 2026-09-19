import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const envFile = path.join(__dirname, ".env");

async function loadDotEnv() {
  try {
    const raw = await fs.readFile(envFile, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional
  }
}

await loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AVATAR_IMAGE_URL = (process.env.AVATAR_IMAGE_URL || "").trim();

const sessionMemory = new Map();
const longTermMemory = new Map();
const rateWindowMs = 60_000;
const maxRequestsPerWindow = 30;
const requestCounters = new Map();

const appConfig = {
  avatar: { type: "2D", platform: "web", imageUrl: AVATAR_IMAGE_URL || null },
  voice: { stt: "Web Speech API", tts: "Web Speech API" },
  latencyBudgetMs: 2000,
  languages: ["ja", "en"],
  extensionMode: "Custom GPT + Actions/API",
};

const systemPrompt = [
  "あなたは配信向けアバターAIです。",
  "口調は親しみやすく短め、ただし失礼にならないこと。",
  "返答には必ずemotionタグを1つ選ぶ: happy|neutral|troubled。",
  "形式: {\"reply\":\"...\",\"emotion\":\"happy|neutral|troubled\"}",
].join("\n");

function nowIso() {
  return new Date().toISOString();
}

function safeLog(event, details) {
  const redacted = { ...details };
  if (typeof redacted.message === "string") {
    redacted.message = `[len=${redacted.message.length}]`;
  }
  console.log(JSON.stringify({ timestamp: nowIso(), event, ...redacted }));
}

function checkRateLimit(ip) {
  const now = Date.now();
  const item = requestCounters.get(ip) || { start: now, count: 0 };
  if (now - item.start > rateWindowMs) {
    item.start = now;
    item.count = 0;
  }
  item.count += 1;
  requestCounters.set(ip, item);
  return item.count <= maxRequestsPerWindow;
}

function moderateInput(text = "") {
  const banned = ["kill", "bomb", "自殺", "爆弾"];
  const lower = text.toLowerCase();
  if (text.length > 1000) return { ok: false, reason: "message too long" };
  if (banned.some((w) => lower.includes(w.toLowerCase()))) {
    return { ok: false, reason: "unsafe content" };
  }
  return { ok: true };
}

function inferEmotion(text = "") {
  const happyWords = ["ありがとう", "嬉しい", "最高", "great", "happy", "awesome"];
  const troubledWords = ["困", "むず", "error", "fail", "つらい"];
  const lower = text.toLowerCase();
  if (happyWords.some((w) => lower.includes(w.toLowerCase()))) return "happy";
  if (troubledWords.some((w) => lower.includes(w.toLowerCase()))) return "troubled";
  return "neutral";
}

function getSession(id) {
  if (!sessionMemory.has(id)) sessionMemory.set(id, []);
  return sessionMemory.get(id);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function callOpenAI(messages) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.output_text || "";
  return text;
}

async function handleChat(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return sendJson(res, 429, { error: "Rate limit exceeded" });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const message = String(body.message || "").trim();
  const sessionId = String(body.sessionId || "default");
  const userId = String(body.userId || "anonymous");

  const moderation = moderateInput(message);
  if (!moderation.ok) {
    return sendJson(res, 400, {
      error: "Blocked by guardrail",
      reason: moderation.reason,
    });
  }

  const history = getSession(sessionId);
  const profile = longTermMemory.get(userId) || "";

  const promptMessages = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `User profile memory: ${profile || "none"}` },
    ...history.slice(-6),
    { role: "user", content: message },
  ];

  let reply = "";
  let emotion = inferEmotion(message);

  try {
    if (OPENAI_API_KEY) {
      const raw = await callOpenAI(promptMessages);
      try {
        const parsed = JSON.parse(raw);
        reply = parsed.reply || "ごめん、もう一度言ってね。";
        emotion = ["happy", "neutral", "troubled"].includes(parsed.emotion)
          ? parsed.emotion
          : emotion;
      } catch {
        reply = raw || "ごめん、もう一度言ってね。";
      }
    } else {
      reply = `（モック応答）「${message}」について、もっと詳しく教えて！`;
    }
  } catch {
    reply = "いま接続が不安定みたい。テキストで続けよう。";
    emotion = "troubled";
  }

  history.push({ role: "user", content: message });
  history.push({ role: "assistant", content: reply });

  if (/私の名前は(.+?)(です|。|!|！|\.|$)/.test(message)) {
    const name = message.match(/私の名前は(.+?)(です|。|!|！|\.|$)/)?.[1]?.trim();
    if (name) longTermMemory.set(userId, `name:${name}`);
  }

  safeLog("chat", { ip, sessionId, userId, message });
  return sendJson(res, 200, { reply, emotion, fallbackTextOnly: false });
}

async function serveStatic(req, res) {
  let reqPath = req.url?.split("?")[0] || "/";
  if (reqPath === "/") reqPath = "/index.html";
  const normalizedPath = path.normalize(reqPath).replace(/^\/+/, "");
  const filePath = path.join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.url === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, appConfig);
  }

  if (req.url === "/api/chat" && req.method === "POST") {
    return handleChat(req, res);
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Avatar MVP running on http://localhost:${PORT}`);
});
