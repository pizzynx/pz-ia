const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ===== Configuração ===== */
const PRO_CHECKOUT_URL = ""; // Cole aqui o link de pagamento (Stripe Payment Link ou Mercado Pago)
const MAX_HISTORY = 40;      // mensagens enviadas por pedido (o servidor aceita até 60)
const KEY_PREFS = "pz-ai-studio-prefs", KEY_CHATS = "pz-studio-chats-v2";

/* ===== Estado salvo no navegador ===== */
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const prefs = load(KEY_PREFS, {});
const store = load(KEY_CHATS, { convs: [], activeId: null });
const savePrefs = () => { try { localStorage.setItem(KEY_PREFS, JSON.stringify(prefs)); } catch {} };
const persist = () => {
  store.convs = store.convs.sort((a, b) => b.updated - a.updated).slice(0, 200);
  try { localStorage.setItem(KEY_CHATS, JSON.stringify(store)); }
  catch { toast("Espaço do navegador cheio. Exclua conversas antigas."); }
};
const getConv = () => store.convs.find(c => c.id === store.activeId) || null;
function newConv() {
  const c = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), title: "Nova conversa", updated: Date.now(), messages: [] };
  store.convs.push(c); store.activeId = c.id;
  return c;
}

let busy = false, controller = null, menuEl = null, toastT;
let reasoningOn = prefs.reasoning === true; // começa no modo rápido
const input = $("#promptInput"), chat = $("#chatArea");

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ===== Separar texto e blocos de código ===== */
const EXT = { javascript: "js", js: "js", mjs: "mjs", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", html: "html", htm: "html", css: "css", scss: "scss", json: "json", xml: "xml", python: "py", py: "py", bash: "sh", sh: "sh", shell: "sh", md: "md", markdown: "md", java: "java", csharp: "cs", cs: "cs", c: "c", cpp: "cpp", go: "go", rust: "rs", php: "php", ruby: "rb", sql: "sql", yaml: "yml", yml: "yml", lua: "lua", txt: "txt", text: "txt", env: "env" };

function parseSegments(text) {
  const segs = [], re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ type: "text", value: text.slice(last, m.index) });
    const tokens = m[1].trim().split(/\s+/).filter(Boolean);
    const filename = tokens.find(t => /^[\w.\-\/]+\.[A-Za-z0-9]+$/.test(t)) || null;
    const lang = (tokens.find(t => t !== filename) || "").toLowerCase();
    segs.push({ type: "code", lang, filename, code: m[2].replace(/\n$/, "") });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ type: "text", value: text.slice(last) });
  return segs;
}

function analyze(text) {
  const segs = parseSegments(text);
  let n = 0;
  for (const s of segs) if (s.type === "code") s.name = s.filename || `arquivo-${++n}.${EXT[s.lang] || "txt"}`;
  return segs;
}

const cleanName = n => String(n).replace(/\\/g, "/").replace(/\.\.+/g, ".").replace(/^\/+/, "") || "arquivo.txt";

function filesFrom(texts) {
  const map = new Map();
  for (const t of texts) for (const s of analyze(t)) if (s.type === "code") map.set(cleanName(s.name), s.code);
  return [...map].map(([name, content]) => ({ name, content }));
}

/* ===== Markdown (renderização rápida) ===== */
function inline(s) {
  return s.split(/(`[^`\n]+`)/).map((p, i) => i % 2 ? `<code>${p.slice(1, -1)}</code>` : p
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')).join("");
}

function renderText(src) {
  let html = "", list = null, para = [];
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  const flush = () => { if (para.length) { html += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
  for (const raw of esc(src).split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); close(); html += "<hr>"; }
    else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); close(); const l = m[1].length + 2; html += `<h${l}>${inline(m[2])}</h${l}>`; }
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flush(); if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flush(); if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^&gt;\s?(.*)$/))) { flush(); close(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (!line.trim()) { flush(); close(); }
    else { close(); para.push(line); }
  }
  flush(); close();
  return html;
}

function codeHTML(s) {
  return `<div class="code"><div class="code-head"><span class="code-name">${esc(s.name)}</span><span><button data-act="copy">Copiar</button><button data-act="download">Baixar</button></span></div><pre><code>${esc(s.code)}</code></pre></div>`;
}

function renderMd(src) {
  if ((src.match(/```/g) || []).length % 2) src += "\n```"; // bloco de código ainda sendo recebido
  return analyze(src).map(s => s.type === "code" ? codeHTML(s) : renderText(s.value)).join("");
}

/* ===== Linhas do chat ===== */
function userRow(text) {
  const el = document.createElement("article");
  el.className = "msg user";
  el.innerHTML = `<div class="bubble">${esc(text)}</div>`;
  return el;
}

function aiRow() {
  const el = document.createElement("article");
  el.className = "msg ai";
  el.innerHTML = `<div class="ai-av">✦</div><div class="ai-body"><div class="content"></div><div class="actions" hidden></div></div>`;
  return el;
}

function setAI(row, text, done, isLast = false) {
  row._raw = text;
  row.querySelector(".content").innerHTML = renderMd(text) + (done ? "" : '<span class="caret"></span>');
  const act = row.querySelector(".actions");
  if (!done) { act.hidden = true; return; }
  const n = analyze(text).filter(s => s.type === "code").length;
  act.innerHTML = `<button data-act="copy-msg">⎘ Copiar</button>${isLast ? '<button data-act="regen">↻ Regenerar</button>' : ""}${n ? `<button data-act="zip">⬇ ZIP (${n})</button>` : ""}`;
  act.hidden = false;
}

function setWait(row, label) {
  row.querySelector(".content").innerHTML = `<div class="waiting"><span class="dots"><span></span><span></span><span></span></span>${esc(label)}</div>`;
}

function errorRow(msg) {
  const r = aiRow();
  r.querySelector(".content").innerHTML = `<div class="notice err">${esc(msg)}</div>`;
  const a = r.querySelector(".actions");
  a.innerHTML = '<button data-act="retry">↻ Tentar de novo</button>';
  a.hidden = false;
  return r;
}

const titleFor = () => { const c = getConv(); return c?.messages.length ? c.title : "Assistente de código"; };

function renderConv() {
  const c = getConv(), msgs = c?.messages || [], box = $("#messages");
  box.innerHTML = "";
  msgs.forEach((m, i) => {
    if (m.role === "user") box.appendChild(userRow(m.content));
    else { const r = aiRow(); setAI(r, m.content, true, i === msgs.length - 1); box.appendChild(r); }
  });
  $("#welcome").hidden = msgs.length > 0;
  $("#toBottom").hidden = true;
  if (!document.body.classList.contains("video-mode")) $("#title").textContent = titleFor();
  renderList();
  chat.scrollTop = chat.scrollHeight;
}

/* ===== Rolagem inteligente ===== */
const nearBottom = () => chat.scrollHeight - chat.scrollTop - chat.clientHeight < 140;
function scrollEnd(force = false) { if (force || nearBottom()) chat.scrollTop = chat.scrollHeight; }
chat.addEventListener("scroll", () => { $("#toBottom").hidden = nearBottom(); });
$("#toBottom").onclick = () => chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });

/* ===== Lista de conversas ===== */
function renderList() {
  const q = $("#search").value.trim().toLowerCase(), list = $("#convList");
  const items = [...store.convs].sort((a, b) => b.updated - a.updated)
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q)));
  const day = 864e5, now = Date.now(), groups = { "Hoje": [], "Últimos 7 dias": [], "Anteriores": [] };
  for (const c of items) { const age = now - c.updated; groups[age < day ? "Hoje" : age < 7 * day ? "Últimos 7 dias" : "Anteriores"].push(c); }
  list.innerHTML = "";
  for (const [label, arr] of Object.entries(groups)) {
    if (!arr.length) continue;
    list.insertAdjacentHTML("beforeend", `<div class="side-label">${label}</div>`);
    for (const c of arr) {
      const row = document.createElement("div");
      row.className = "conv" + (c.id === store.activeId ? " active" : "");
      row.innerHTML = `<button class="conv-title">${esc(c.title)}</button><button class="conv-more" aria-label="Opções">⋯</button>`;
      row.querySelector(".conv-title").onclick = () => openConv(c.id);
      row.querySelector(".conv-more").onclick = e => { e.stopPropagation(); showMenu(e.currentTarget, c); };
      list.appendChild(row);
    }
  }
  if (!items.length) list.insertAdjacentHTML("beforeend", `<p class="empty-list">${q ? "Nenhuma conversa encontrada." : "Suas conversas aparecem aqui."}</p>`);
}

function showMenu(btn, c) {
  closeMenu();
  menuEl = document.createElement("div");
  menuEl.className = "ctx";
  menuEl.innerHTML = '<button data-a="rename">✎ Renomear</button><button data-a="delete" class="danger">✕ Excluir</button>';
  const r = btn.getBoundingClientRect();
  menuEl.style.top = r.bottom + 4 + "px";
  menuEl.style.left = Math.min(r.left, innerWidth - 185) + "px";
  menuEl.onclick = e => {
    const a = e.target.dataset.a;
    closeMenu();
    if (a === "rename") renameConv(c);
    if (a === "delete") deleteConv(c);
  };
  document.body.appendChild(menuEl);
}
function closeMenu() { menuEl?.remove(); menuEl = null; }

function renameConv(c) {
  const t = prompt("Novo nome da conversa:", c.title);
  if (!t?.trim()) return;
  c.title = t.trim().slice(0, 80);
  persist();
  if (c.id === store.activeId) $("#title").textContent = c.title;
  renderList();
}

function deleteConv(c) {
  if (!confirm(`Excluir "${c.title}"?`)) return;
  if (c.id === store.activeId) { stopGeneration(); store.activeId = null; }
  store.convs = store.convs.filter(x => x.id !== c.id);
  persist();
  renderConv();
  toast("Conversa excluída.");
}

function openConv(id) {
  stopGeneration();
  store.activeId = id;
  persist();
  switchView(false);
  renderConv();
}

function newChat() {
  stopGeneration();
  store.activeId = null;
  input.value = "";
  resize();
  switchView(false);
  renderConv();
  input.focus();
}

/* ===== Envio e streaming ===== */
function setBusy(on) {
  const b = $("#sendBtn");
  b.textContent = on ? "■" : "↑";
  b.classList.toggle("stop", on);
  b.title = b.ariaLabel = on ? "Parar (Esc)" : "Enviar";
}

function stopGeneration() { controller?.abort(); }

function send(text) {
  const content = text.trim();
  if (!content || busy) return;
  const c = getConv() || newConv();
  if (!c.messages.length) c.title = content.replace(/\s+/g, " ").slice(0, 60);
  c.messages.push({ role: "user", content });
  c.updated = Date.now();
  $("#welcome").hidden = true;
  $("#messages").appendChild(userRow(content));
  input.value = "";
  resize();
  persist();
  renderList();
  scrollEnd(true);
  generate();
}

async function generate() {
  const c = getConv();
  if (!c || busy) return;
  busy = true;
  setBusy(true);
  const row = aiRow();
  $("#messages").appendChild(row);
  setWait(row, "Pensando…");
  scrollEnd(true);

  const ctrl = (controller = new AbortController());
  const t0 = Date.now();
  let acc = "", finish = null, truncated = false, thinking = false, painting = false, ended = false;
  const tick = setInterval(() => {
    if (!acc) setWait(row, `${thinking ? "Raciocinando" : "Gerando"} · ${Math.floor((Date.now() - t0) / 1000)}s`);
  }, 1000);
  // Agrupa os tokens e pinta no máximo uma vez por quadro: resposta fluida e sem travar
  const paint = () => {
    painting = false;
    if (ended) return;
    setAI(row, acc, false);
    if (nearBottom()) scrollEnd();
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ model: $("#modelSelect").value, messages: c.messages.slice(-MAX_HISTORY), reasoning: reasoningOn })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao consultar o modelo.");

    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const evt = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = evt.split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;
        let d;
        try { d = JSON.parse(line.slice(5)); } catch { continue; }
        if (d.error) throw new Error(d.error);
        if (d.thinking) thinking = true;
        if (d.truncated) truncated = true;
        if (d.finish) finish = d.finish;
        if (d.delta) {
          acc += d.delta;
          if (!painting) { painting = true; requestAnimationFrame(paint); }
        }
      }
    }
    ended = true;
    if (!acc) acc = `O modelo terminou sem enviar texto (motivo: ${finish || "desconhecido"}). Tente outro modelo ou envie de novo.`;
    c.messages.push({ role: "assistant", content: acc });
    setAI(row, acc, true, true);
    if (truncated) row.querySelector(".ai-body").insertAdjacentHTML("beforeend", '<div class="notice">Resposta cortada pelo limite. Envie "continue" para receber o restante.</div>');
  } catch (e) {
    ended = true;
    if (e.name === "AbortError" && acc) {
      c.messages.push({ role: "assistant", content: acc });
      setAI(row, acc, true, true);
      row.querySelector(".ai-body").insertAdjacentHTML("beforeend", '<div class="notice">Geração interrompida.</div>');
    } else if (e.name === "AbortError") {
      row.remove();
    } else {
      const msg = e instanceof TypeError ? "Não consegui conectar ao servidor. Verifique sua conexão." : e.message;
      row.replaceWith(errorRow(msg));
    }
  } finally {
    ended = true;
    clearInterval(tick);
    controller = null;
    busy = false;
    setBusy(false);
    c.updated = Date.now();
    persist();
    renderList();
    input.focus();
  }
}

function regenerate() {
  const c = getConv();
  if (busy || c?.messages.at(-1)?.role !== "assistant") return;
  c.messages.pop();
  persist();
  [...$("#messages").querySelectorAll(".msg.ai")].at(-1)?.remove();
  generate();
}

/* ===== Cópia, download e ZIP ===== */
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) return toast("Não foi possível copiar.");
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = "Copiado ✓";
    setTimeout(() => { btn.textContent = old; }, 1500);
  } else toast("Copiado!");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

// ZIP sem compressão, gerado no próprio navegador
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | ((now.getSeconds() / 2) | 0);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.content), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

function downloadZip(files, name) {
  if (!files.length) return toast("Nenhum arquivo de código para compactar.");
  downloadBlob(makeZip(files), name);
  toast(`ZIP com ${files.length} arquivo(s) gerado.`);
}

/* ===== Modelos e status ===== */
const RECOMMENDED = [/^anthropic\/claude-(opus|sonnet)/i, /^openai\/gpt-5/i, /^google\/gemini-(2\.5-pro|3)/i, /^deepseek\/deepseek-(r1|v3)/i, /^x-ai\/grok/i, /^qwen\/qwen3-coder/i];

function populateModels(list) {
  const sel = $("#modelSelect");
  sel.innerHTML = "";
  sel.appendChild(new Option("OpenRouter Auto (escolhe o melhor)", "openrouter/auto"));
  const rec = list.filter(m => RECOMMENDED.some(rx => rx.test(m.id)));
  if (rec.length) {
    const g = Object.assign(document.createElement("optgroup"), { label: "Recomendados" });
    rec.forEach(m => g.appendChild(new Option(m.name, m.id)));
    sel.appendChild(g);
  }
  if (list.length) {
    const g = Object.assign(document.createElement("optgroup"), { label: `Todos (${list.length})` });
    list.forEach(m => g.appendChild(new Option(m.name, m.id)));
    sel.appendChild(g);
  }
  if (prefs.model && [...sel.options].some(o => o.value === prefs.model)) sel.value = prefs.model;
}

async function loadModels({ silent = false } = {}) {
  const btn = $("#refreshModels");
  btn.textContent = "…";
  try {
    const r = await fetch("/api/models"), d = await r.json();
    if (!r.ok) throw new Error(d.error || "Não foi possível carregar modelos.");
    populateModels(d.models || []);
    if (!silent) toast(`${(d.models || []).length} modelos carregados.`);
  } catch (e) {
    if (!silent) toast(e.message);
  } finally {
    btn.textContent = "↻";
  }
}

async function checkStatus() {
  try {
    const d = await (await fetch("/api/status")).json();
    $("#statusDot").classList.toggle("ok", !!d.configured);
    $("#connText").textContent = d.configured ? "OpenRouter conectada" : "Configure o arquivo .env";
  } catch {
    $("#connText").textContent = "Servidor indisponível";
  }
}

/* ===== Navegação, tema e menus ===== */
function switchView(video) {
  document.body.classList.toggle("video-mode", video);
  $("#videoStudio").hidden = !video;
  $("#codeNav").classList.toggle("active", !video);
  $("#videoNav").classList.toggle("active", video);
  $("#title").textContent = video ? "AI Video Studio" : titleFor();
  toggleSidebar(false);
}

const toggleSidebar = on => { $("#sidebar").classList.toggle("open", on); $("#scrim").classList.toggle("show", on); };

function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme === "light" ? "light" : "dark";
  $("#themeBtn").textContent = prefs.theme === "light" ? "☾" : "☀";
}

function applyReason() { $("#reasonToggle").setAttribute("aria-pressed", String(reasoningOn)); }

function resize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
}

/* ===== Eventos ===== */
input.addEventListener("input", resize);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!busy) $("#chatForm").requestSubmit();
  }
});
$("#chatForm").addEventListener("submit", e => {
  e.preventDefault();
  if (busy) return stopGeneration();
  send(input.value);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (busy) stopGeneration(); closeMenu(); toggleSidebar(false); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newChat(); }
});
document.addEventListener("click", closeMenu);

$("#newChat").onclick = newChat;
$("#codeNav").onclick = () => switchView(false);
$("#videoNav").onclick = () => switchView(true);
$("#menuBtn").onclick = () => toggleSidebar(!$("#sidebar").classList.contains("open"));
$("#scrim").onclick = () => toggleSidebar(false);
$("#search").addEventListener("input", renderList);
$("#refreshModels").onclick = () => loadModels();
$("#modelSelect").onchange = e => { prefs.model = e.target.value; savePrefs(); };

$("#reasonToggle").onclick = () => {
  reasoningOn = !reasoningOn;
  prefs.reasoning = reasoningOn;
  savePrefs();
  applyReason();
  toast(reasoningOn ? "Raciocínio profundo ativado: mais preciso, porém mais lento." : "Modo rápido ativado: respostas mais rápidas.");
};

$("#themeBtn").onclick = () => {
  prefs.theme = prefs.theme === "light" ? "dark" : "light";
  savePrefs();
  applyTheme();
};

$("#zipAll").onclick = () => {
  const c = getConv();
  const files = filesFrom(c ? c.messages.filter(m => m.role === "assistant").map(m => m.content) : []);
  if (!files.length) return toast("Ainda não há arquivos de código nesta conversa.");
  downloadZip(files, "pz-ai-projeto.zip");
};

document.querySelectorAll(".sugg").forEach(b => b.onclick = () => { switchView(false); send(b.dataset.prompt); });

$("#openPro").onclick = () => $("#proDialog").showModal();
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
$("#proDialog").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$("#checkoutBtn").onclick = () => {
  if (PRO_CHECKOUT_URL) location.href = PRO_CHECKOUT_URL;
  else toast("Pagamento ainda não ativado: cole o link em PRO_CHECKOUT_URL no app.js.");
};

$("#messages").addEventListener("click", async e => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const row = btn.closest(".msg"), act = btn.dataset.act;
  if (act === "copy" || act === "download") {
    const card = btn.closest(".code"), text = card.querySelector("pre").textContent;
    if (act === "copy") await copyText(text, btn);
    else downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), cleanName(card.querySelector(".code-name").textContent));
  } else if (act === "copy-msg") await copyText(row._raw, btn);
  else if (act === "regen") regenerate();
  else if (act === "zip") downloadZip(filesFrom([row._raw]), "arquivos-resposta.zip");
  else if (act === "retry" && !busy) { row.remove(); generate(); }
});

/* ===== AI Video Studio ===== */
function makeVideoPrompt() {
  const idea = $("#videoPrompt").value.trim();
  if (!idea) { toast("Descreva a cena primeiro."); $("#videoPrompt").focus(); return null; }
  return `Create a ${$("#videoStyle").value} video in ${$("#videoRatio").value} aspect ratio. Scene: ${idea}. Camera movement: ${$("#videoCamera").value}. High visual quality, coherent motion, consistent subject details, natural lighting and believable physics. Keep the scene clean and focused. Avoid unwanted text, logos, flicker, distorted anatomy, and abrupt unintended cuts.`;
}

$("#buildVideoPrompt").onclick = () => {
  const p = makeVideoPrompt();
  if (!p) return;
  $("#videoOutput").value = p;
  $("#copyVideoPrompt").disabled = false;
  toast("Prompt preparado.");
};

$("#copyVideoPrompt").onclick = async () => {
  const out = $("#videoOutput");
  try { await navigator.clipboard.writeText(out.value); toast("Prompt copiado!"); }
  catch { out.select(); toast("Selecione o texto e copie com Ctrl+C."); }
};

$("#generateVideo").onclick = async () => {
  const prompt = makeVideoPrompt();
  if (!prompt) return;
  const btn = $("#generateVideo"), status = $("#videoStatus"), result = $("#videoResult");
  $("#videoOutput").value = prompt;
  $("#copyVideoPrompt").disabled = false;
  result.hidden = true;
  status.className = "video-status";
  status.textContent = "Enviando para o Gemini Omni Flash… pode levar alguns minutos. Não feche esta página.";
  btn.disabled = true;
  btn.textContent = "Gerando vídeo…";
  try {
    const res = await fetch("/api/video/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, aspectRatio: $("#videoRatio").value, resolution: $("#videoResolution").value })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "A geração de vídeo falhou.");
    $("#generatedVideo").src = data.videoUrl;
    Object.assign($("#downloadVideo"), { href: data.videoUrl, download: data.filename || "pz-ai-video.mp4" });
    result.hidden = false;
    status.textContent = "Vídeo gerado com sucesso!";
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    status.className = "video-status error";
    status.textContent = `Não foi possível gerar o vídeo.\n${err.message}\n\nConfira GOOGLE_AI_STUDIO_API_KEY no .env e o faturamento do projeto Google.`;
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Gerar vídeo com Gemini";
  }
};

/* ===== Início ===== */
applyTheme();
applyReason();
populateModels([]);
renderConv();
loadModels({ silent: true });
checkStatus();
