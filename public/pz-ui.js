/* =====================================================================
   PZ AI — comportamentos visuais da nova interface.
   Este módulo NÃO envia mensagens, NÃO chama a API e NÃO altera o
   histórico. Ele apenas:
     • preenche o campo de mensagem existente (#promptInput) com sugestões;
     • abre a área de Imagens já existente a partir de atalhos;
     • controla o menu lateral no celular e os avisos (toast);
     • sinaliza com um aviso os botões ainda sem funcionalidade.
   ===================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ---------- Toast ---------- */
let toastEl = null;
let toastTimer = 0;
function toast(message) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "pz-toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  // força reflow para reiniciar a transição se já estiver visível
  toastEl.classList.remove("show");
  void toastEl.offsetWidth;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}
window.pzToast = toast;

/* ---------- Campo de mensagem (reaproveita o chat existente) ---------- */
function fillPrompt(text, { enableWeb = false } = {}) {
  const input = $("#promptInput");
  if (!input) return;
  if (input.disabled) { toast("Aguarde a resposta atual terminar para usar uma sugestão."); return; }
  if (enableWeb) {
    const web = $("#webToggleBtn");
    if (web && web.getAttribute("aria-pressed") !== "true") web.click();
  }
  input.value = text;
  input.focus();
  input.setSelectionRange(text.length, text.length);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function openImageStudio(prompt = "") {
  // usa o botão/atalho que já abre a área de Imagens (mesma função original)
  $("#navImagesBtn")?.click();
  const imageInput = $("#imagePromptInput");
  if (imageInput && prompt) {
    imageInput.value = prompt;
    imageInput.focus();
    imageInput.setSelectionRange(prompt.length, prompt.length);
  }
}

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const suggest = target.closest("[data-suggest]");
  if (suggest) { fillPrompt(suggest.dataset.suggest); return; }

  const images = target.closest("[data-open-images]");
  if (images) { openImageStudio(images.dataset.openImages); return; }

  const quick = target.closest("[data-quick]");
  if (quick) {
    const raw = quick.dataset.quick;
    const useWeb = raw.startsWith("web:");
    fillPrompt(useWeb ? raw.slice(4) : raw, { enableWeb: useWeb });
    return;
  }

  const soon = target.closest("[data-soon]");
  if (soon) { toast(`${soon.dataset.soon} chega em breve na PZ AI. 💜`); return; }
});

/* ---------- Menu lateral ---------- */
const mobileQuery = window.matchMedia("(max-width: 900px)");
const menuToggle = $("#menuToggleBtn");

function setSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  menuToggle?.setAttribute("aria-expanded", String(open));
  menuToggle?.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
}
menuToggle?.addEventListener("click", () => setSidebar(!document.body.classList.contains("sidebar-open")));
$("#sidebarScrim")?.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", event => { if (event.key === "Escape") setSidebar(false); });
mobileQuery.addEventListener("change", () => setSidebar(false));

// no celular, fecha o menu depois de escolher algo
$("#sidebar")?.addEventListener("click", event => {
  if (!mobileQuery.matches) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".nav-item, .list-item, .new-chat-pill") && !target.closest("[data-del]")) setSidebar(false);
});

/* ---------- Histórico ---------- */
$("#navHistoryBtn")?.addEventListener("click", () => {
  const panel = $("#historyPanel");
  const hasChats = $$(".list-item", panel).length > 0;
  if (!hasChats) { toast("Você ainda não tem conversas. Envie a primeira mensagem! 💜"); return; }
  panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  panel?.classList.remove("flash");
  void panel?.offsetWidth;
  panel?.classList.add("flash");
});

/* ---------- Card Pro ---------- */
$("#proLearnMoreBtn")?.addEventListener("click", () => toast("O PZ AI Pro está chegando. Em breve você saberá mais! 💜"));
