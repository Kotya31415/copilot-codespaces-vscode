const sessionId = crypto.randomUUID();
const userIdKey = "avatar-mvp-user-id";
const userId = localStorage.getItem(userIdKey) || crypto.randomUUID();
localStorage.setItem(userIdKey, userId);

const avatar = document.getElementById("avatar");
const mouth = document.getElementById("mouth");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const stopBtn = document.getElementById("stopBtn");
const configText = document.getElementById("configText");

let recognition;
let listening = false;

function addLog(who, text) {
  const row = document.createElement("div");
  row.className = who === "user" ? "u" : "a";
  row.textContent = `${who === "user" ? "You" : "Avatar"}: ${text}`;
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
}

function setEmotion(emotion) {
  avatar.classList.remove("emotion-happy", "emotion-neutral", "emotion-troubled");
  avatar.classList.add(`emotion-${emotion}`);
}

function setSpeaking(open) {
  mouth.classList.toggle("open", open);
  mouth.classList.toggle("closed", !open);
}

function stopAllAudio() {
  window.speechSynthesis?.cancel();
  setSpeaking(false);
  statusEl.textContent = "停止";
}

async function loadConfig() {
  const res = await fetch("/api/config");
  const cfg = await res.json();
  configText.textContent = `構成: ${cfg.avatar.type}/${cfg.avatar.platform} | STT:${cfg.voice.stt} | TTS:${cfg.voice.tts} | Mode:${cfg.extensionMode}`;
}

function speak(text, emotion) {
  if (!("speechSynthesis" in window)) {
    statusEl.textContent = "TTS非対応: テキスト表示のみ";
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  utter.onstart = () => {
    setEmotion(emotion || "neutral");
    statusEl.textContent = "応答中";
  };
  utter.onboundary = () => {
    setSpeaking(true);
    setTimeout(() => setSpeaking(false), 70);
  };
  utter.onend = () => {
    setSpeaking(false);
    statusEl.textContent = "待機中";
  };
  utter.onerror = () => {
    setSpeaking(false);
    statusEl.textContent = "音声失敗: テキストで継続";
  };
  speechSynthesis.speak(utter);
}

async function sendMessage(message) {
  const text = message.trim();
  if (!text) return;

  addLog("user", text);
  statusEl.textContent = "考え中";

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, sessionId, userId }),
  });
  const data = await res.json();

  if (!res.ok) {
    addLog("assistant", `エラー: ${data.error || "unknown"}`);
    statusEl.textContent = "待機中";
    return;
  }

  addLog("assistant", data.reply);
  speak(data.reply, data.emotion || "neutral");
}

function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    micBtn.disabled = true;
    micBtn.title = "このブラウザはSTT未対応";
    return;
  }

  recognition = new SR();
  recognition.lang = "ja-JP";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    listening = true;
    statusEl.textContent = "聞き取り中";
    stopAllAudio(); // 割り込み実装
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript || "";
    textInput.value = transcript;
    sendMessage(transcript).catch((e) => {
      addLog("assistant", `エラー: ${e.message}`);
      statusEl.textContent = "待機中";
    });
  };

  recognition.onend = () => {
    listening = false;
    if (statusEl.textContent === "聞き取り中") {
      statusEl.textContent = "待機中";
    }
  };
}

sendBtn.addEventListener("click", () => sendMessage(textInput.value));
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage(textInput.value);
});

micBtn.addEventListener("click", () => {
  if (!recognition) return;
  if (listening) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

stopBtn.addEventListener("click", stopAllAudio);

setupSpeechRecognition();
loadConfig().catch(() => {
  configText.textContent = "構成取得に失敗";
});
