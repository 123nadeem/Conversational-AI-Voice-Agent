"use strict";

let audioContext    = null;
let mediaStream     = null;
let scriptProcessor = null;
let audioChunks     = [];
let isRecording     = false;
let isProcessing    = false;
let currentAudio    = null;

const micBtn    = document.getElementById("mic");
const indicator = document.getElementById("indicator");
const statusTxt = document.getElementById("status-text");
const chat      = document.getElementById("chat");

/* ── WAV encoder ── */
function encodeWAV(samples, sampleRate) {
  const buf  = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const ws   = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true);
  ws(8, "WAVE"); ws(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); ws(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/* ── START recording ── */
async function startRecording() {
  if (isProcessing) return;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert("Microphone access required. Allow it and refresh.");
    return;
  }

  audioContext    = new (window.AudioContext || window.webkitAudioContext)();
  const source    = audioContext.createMediaStreamSource(mediaStream);
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  audioChunks     = [];
  isRecording     = true;

  scriptProcessor.onaudioprocess = (e) => {
    if (isRecording) audioChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  micBtn.classList.add("recording");
  setStatus("recording", "Recording… release to send");
}

/* ── STOP recording ── */
function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  mediaStream.getTracks().forEach(t => t.stop());
  scriptProcessor.disconnect();

  const ctxRate  = audioContext.sampleRate;
  audioContext.close();

  setStatus("thinking", "Processing…");

  // merge Float32 chunks
  const totalLen   = audioChunks.reduce((s, c) => s + c.length, 0);
  const merged     = new Float32Array(totalLen);
  let off = 0;
  for (const c of audioChunks) { merged.set(c, off); off += c.length; }

  // downsample to 16kHz (Whisper sweet spot)
  const TARGET = 16000;
  const ratio  = ctxRate / TARGET;
  const down   = new Float32Array(Math.floor(merged.length / ratio));
  for (let i = 0; i < down.length; i++) down[i] = merged[Math.floor(i * ratio)];

  const wavBlob = encodeWAV(down, TARGET);
  handleAudio(wavBlob);
}

/* ── PIPELINE: WAV → Whisper → GPT-4o → TTS ── */
async function handleAudio(blob) {
  if (blob.size < 3200) {          // < ~0.1 sec at 16kHz 16-bit
    setStatus("", "Ready — too short, hold longer");
    return;
  }

  isProcessing    = true;
  micBtn.disabled = true;

  // 1. Whisper
  setStatus("thinking", "Transcribing…");
  let transcript;
  try {
    const form = new FormData();
    form.append("audio", blob, "audio.wav");
    const res  = await fetch("/transcribe", { method: "POST", body: form });
    const data = await res.json();
    transcript = (data.text || "").trim();
  } catch (e) {
    console.error(e);
    showError("Transcription failed.");
    done(); return;
  }

  if (!transcript) {
    setStatus("", "Ready — nothing heard, try again");
    done(); return;
  }

  addMessage("user", transcript);

  // 2. GPT-4o
  setStatus("thinking", "Thinking…");
  let reply;
  try {
    const res  = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: transcript }),
    });
    const data = await res.json();
    reply = (data.reply || "").trim();
  } catch (e) {
    console.error(e);
    showError("GPT-4o request failed.");
    done(); return;
  }

  const typingEl = addTyping();

  // 3. TTS
  setStatus("thinking", "Generating voice…");
  let audioBlob;
  try {
    const res = await fetch("/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply }),
    });
    audioBlob = await res.blob();
  } catch (e) {
    typingEl.remove();
    addMessage("ai", reply);
    done(); return;
  }

  typingEl.remove();
  addMessage("ai", reply);
  setStatus("speaking", "Speaking…");

  const url    = URL.createObjectURL(audioBlob);
  currentAudio = new Audio(url);
  currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; done(); };
  currentAudio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; done(); };
  await currentAudio.play().catch(() => done());
}

/* ── HELPERS ── */
function done() {
  isProcessing    = false;
  micBtn.disabled = false;
  setStatus("", "Ready");
}
function setStatus(state, text) {
  indicator.className   = "indicator " + state;
  statusTxt.textContent = text;
}
function clearWelcome() {
  const w = chat.querySelector(".welcome");
  if (w) w.remove();
}
function addMessage(role, text) {
  clearWelcome();
  const wrap  = document.createElement("div");
  wrap.className = "msg " + role;
  const label = document.createElement("div");
  label.className   = "msg-label";
  label.textContent = role === "user" ? "You" : "AI";
  const bub = document.createElement("div");
  bub.className   = "bubble";
  bub.textContent = text;
  wrap.appendChild(label);
  wrap.appendChild(bub);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}
function addTyping() {
  clearWelcome();
  const wrap  = document.createElement("div");
  wrap.className = "msg ai typing";
  const label = document.createElement("div");
  label.className   = "msg-label";
  label.textContent = "AI";
  const bub = document.createElement("div");
  bub.className = "bubble";
  bub.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
  wrap.appendChild(label);
  wrap.appendChild(bub);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}
function showError(msg) {
  clearWelcome();
  const wrap = document.createElement("div");
  wrap.className = "msg ai";
  wrap.innerHTML = `<div class="msg-label">Error</div><div class="bubble" style="border-color:rgba(240,79,114,0.35)">${msg}</div>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}
async function resetChat() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  chat.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">🎙</div>
      <p>Press and hold the mic button to speak.<br/>Release to get an answer.</p>
    </div>`;
  setStatus("", "Ready");
  await fetch("/reset", { method: "POST" });
}
document.getElementById("mic").addEventListener("contextmenu", e => e.preventDefault());