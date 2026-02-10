/* ═══════════════════════════════════════════════════════════
   Mistral AI Chatbot – Frontend Application
   Streaming · Projects · File Upload · Markdown
   ═══════════════════════════════════════════════════════════ */

const BACKEND_URL = "https://web-production-de319.up.railway.app";

// ─── State ───────────────────────────────────────────────
let currentSessionId = null;
let currentProjectId = null;   // active project scope (null = no project)
let sessions = [];
let projects = [];
let pendingFiles = [];         // files waiting to be sent
let isStreaming = false;
let searchDebounce = null;
let thinkingMode = false;      // Quick (false) / Thinking (true)

// ─── DOM refs ────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const sidebar       = $("#sidebar");
const sidebarOverlay= $("#sidebarOverlay");
const menuBtn       = $("#menuBtn");
const newChatBtn    = $("#newChatBtn");
const searchInput   = $("#searchInput");
const sessionList   = $("#sessionList");
const projectList   = $("#projectList");
const chatMessages  = $("#chatMessages");
const welcomeScreen = $("#welcomeScreen");
const messageInput  = $("#messageInput");
const sendBtn       = $("#sendBtn");
const chatForm      = $("#chatForm");
const chatTitle     = $("#chatTitle");
const themeToggle   = $("#themeToggle");
const deleteChatBtn = $("#deleteChatBtn");
const attachBtn     = $("#attachBtn");
const fileInput     = $("#fileInput");
const filePreviewBar= $("#filePreviewBar");
const projectBadge  = $("#projectBadge");
const projectBadgeName = $("#projectBadgeName");
const thinkingToggle = $("#thinkingToggle");

// Tabs
const tabChats      = $("#tabChats");
const tabProjects   = $("#tabProjects");
const panelChats    = $("#panelChats");
const panelProjects = $("#panelProjects");

// Modal
const projectModal  = $("#projectModal");
const modalTitle    = $("#modalTitle");
const modalClose    = $("#modalClose");
const modalCancel   = $("#modalCancel");
const modalSave     = $("#modalSave");
const projectNameInput = $("#projectNameInput");
const projectInstructionsInput = $("#projectInstructionsInput");
const charCount     = $("#charCount");

let editingProjectId = null;   // null = create mode, string = edit mode

// ─── Toast ───────────────────────────────────────────────
function showToast(msg, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = "toastOut 0.25s ease forwards";
    setTimeout(() => t.remove(), 250);
  }, 2800);
}

// ═══ THEME ═══════════════════════════════════════════════
function initTheme() {
  const stored = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", stored);
  updateHljsTheme(stored);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateHljsTheme(next);
}
function updateHljsTheme(theme) {
  const link = document.getElementById("hljs-theme");
  link.href = theme === "dark"
    ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css"
    : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
}
themeToggle.addEventListener("click", toggleTheme);
initTheme();

// ═══ THINKING TOGGLE ═════════════════════════════════════
thinkingToggle.querySelectorAll(".think-option").forEach(btn => {
  btn.addEventListener("click", () => {
    thinkingToggle.querySelectorAll(".think-option").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    thinkingMode = btn.dataset.mode === "thinking";
  });
});

// ═══ SIDEBAR (mobile) ════════════════════════════════════
menuBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("active");
});
sidebarOverlay.addEventListener("click", closeSidebar);
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
}

// ═══ SIDEBAR TABS ════════════════════════════════════════
tabChats.addEventListener("click", () => switchTab("chats"));
tabProjects.addEventListener("click", () => switchTab("projects"));

function switchTab(tab) {
  tabChats.classList.toggle("active", tab === "chats");
  tabProjects.classList.toggle("active", tab === "projects");
  panelChats.classList.toggle("active", tab === "chats");
  panelProjects.classList.toggle("active", tab === "projects");
}

// ═══ SESSIONS ════════════════════════════════════════════
async function loadSessions() {
  try {
    let url = `${BACKEND_URL}/api/sessions`;
    if (currentProjectId) url += `?project_id=${currentProjectId}`;
    const res = await fetch(url);
    const data = await res.json();
    sessions = data.sessions || [];
    renderSessionList();
  } catch (e) { console.error("loadSessions:", e); }
}

function renderSessionList(filter = "") {
  sessionList.innerHTML = "";
  const q = filter.toLowerCase();
  const filtered = q ? sessions.filter(s => s.title.toLowerCase().includes(q)) : sessions;

  if (filtered.length === 0) {
    sessionList.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p>${q ? "No matching conversations" : "No conversations yet. Start a new chat!"}</p>
      </div>`;
    return;
  }

  filtered.forEach(s => {
    const item = document.createElement("div");
    item.className = `session-item${s.session_id === currentSessionId ? " active" : ""}`;
    item.innerHTML = `
      <svg class="session-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="session-label">${escapeHtml(s.title)}</span>
      <button class="session-delete" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>`;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".session-delete")) return;
      openSession(s.session_id);
      closeSidebar();
    });
    item.querySelector(".session-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.session_id);
    });
    sessionList.appendChild(item);
  });
}

async function openSession(sid) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sid}`);
    if (!res.ok) return;
    const data = await res.json();
    currentSessionId = sid;
    currentProjectId = data.project_id || null;
    chatTitle.textContent = data.title || "Chat";
    updateProjectBadge();
    renderMessages(data.messages || []);
    renderSessionList(searchInput.value);
  } catch (e) { console.error("openSession:", e); }
}

async function deleteSession(sid) {
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${sid}`, { method: "DELETE" });
    if (sid === currentSessionId) newChat();
    loadSessions();
    showToast("Chat deleted");
  } catch (e) {
    showToast("Couldn't delete chat", "error");
  }
}

deleteChatBtn.addEventListener("click", () => {
  if (currentSessionId) deleteSession(currentSessionId);
});

// ═══ PROJECTS ════════════════════════════════════════════
async function loadProjects() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects`);
    const data = await res.json();
    projects = data.projects || [];
    renderProjectList();
  } catch (e) { console.error("loadProjects:", e); }
}

function renderProjectList() {
  projectList.innerHTML = "";
  if (projects.length === 0) {
    projectList.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2Z"/></svg>
        <p>No projects yet. Create one to set custom instructions for your chats.</p>
      </div>`;
    return;
  }

  projects.forEach(p => {
    const item = document.createElement("div");
    item.className = `project-item${p.project_id === currentProjectId ? " active" : ""}`;
    item.innerHTML = `
      <div class="project-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2Z"/></svg>
      </div>
      <div class="project-info">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-meta">${p.session_count || 0} chat${(p.session_count||0) !== 1 ? 's' : ''}</div>
      </div>
      <div class="project-actions">
        <button class="edit-proj" title="Edit project">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="delete-proj" title="Delete project">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>`;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".edit-proj") || e.target.closest(".delete-proj")) return;
      selectProject(p.project_id);
      closeSidebar();
    });
    item.querySelector(".edit-proj").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditProjectModal(p);
    });
    item.querySelector(".delete-proj").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject(p.project_id);
    });
    projectList.appendChild(item);
  });
}

async function selectProject(pid) {
  if (currentProjectId === pid) {
    // Deselect
    currentProjectId = null;
    updateProjectBadge();
    newChat();
    loadSessions();
    renderProjectList();
    return;
  }
  currentProjectId = pid;
  updateProjectBadge();
  switchTab("chats");
  newChat();
  await loadSessions();
  renderProjectList();
}

function updateProjectBadge() {
  if (currentProjectId) {
    const p = projects.find(x => x.project_id === currentProjectId);
    if (p) {
      projectBadgeName.textContent = p.name;
      projectBadge.classList.remove("hidden");
      return;
    }
  }
  projectBadge.classList.add("hidden");
}

async function deleteProject(pid) {
  try {
    await fetch(`${BACKEND_URL}/api/projects/${pid}`, { method: "DELETE" });
    if (currentProjectId === pid) {
      currentProjectId = null;
      updateProjectBadge();
      newChat();
    }
    await loadProjects();
    await loadSessions();
    showToast("Project deleted");
  } catch (e) {
    showToast("Couldn't delete project", "error");
  }
}

// ─── Project Modal ───────────────────────────────────────
const newProjectBtn = $("#newProjectBtn");
newProjectBtn.addEventListener("click", openCreateProjectModal);

function openCreateProjectModal() {
  editingProjectId = null;
  modalTitle.textContent = "Create Project";
  modalSave.textContent = "Create Project";
  projectNameInput.value = "";
  projectInstructionsInput.value = "";
  charCount.textContent = "0";
  projectModal.classList.remove("hidden");
  setTimeout(() => projectNameInput.focus(), 100);
}

function openEditProjectModal(project) {
  editingProjectId = project.project_id;
  modalTitle.textContent = "Edit Project";
  modalSave.textContent = "Save Changes";
  projectNameInput.value = project.name || "";
  projectInstructionsInput.value = project.instructions || "";
  charCount.textContent = String(project.instructions?.length || 0);
  projectModal.classList.remove("hidden");
  setTimeout(() => projectNameInput.focus(), 100);
}

function closeModal() {
  projectModal.classList.add("hidden");
  editingProjectId = null;
}

modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
projectModal.addEventListener("click", (e) => {
  if (e.target === projectModal) closeModal();
});

projectInstructionsInput.addEventListener("input", () => {
  charCount.textContent = String(projectInstructionsInput.value.length);
});

modalSave.addEventListener("click", async () => {
  const name = projectNameInput.value.trim();
  const instructions = projectInstructionsInput.value.trim();
  if (!name) { showToast("Please enter a project name", "error"); return; }
  if (!instructions) { showToast("Please provide custom instructions", "error"); return; }

  modalSave.disabled = true;
  try {
    if (editingProjectId) {
      // Update
      await fetch(`${BACKEND_URL}/api/projects/${editingProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, instructions }),
      });
      showToast("Project updated");
    } else {
      // Create
      const res = await fetch(`${BACKEND_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, instructions }),
      });
      const data = await res.json();
      currentProjectId = data.project_id;
      updateProjectBadge();
      switchTab("chats");
      showToast("Project created");
    }
    closeModal();
    await loadProjects();
    await loadSessions();
  } catch (e) {
    showToast("Something went wrong", "error");
  } finally {
    modalSave.disabled = false;
  }
});

// ═══ FILE UPLOAD ═════════════════════════════════════════
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFilesSelected);

function handleFilesSelected() {
  const files = Array.from(fileInput.files);
  const maxSize = 100 * 1024 * 1024; // 100 MB

  for (const f of files) {
    if (f.size > maxSize) {
      showToast(`${f.name} exceeds 100 MB`, "error");
      continue;
    }
    if (!pendingFiles.find(pf => pf.name === f.name && pf.size === f.size)) {
      pendingFiles.push(f);
    }
  }
  fileInput.value = "";
  renderFilePreview();
  updateSendBtn();
}

function renderFilePreview() {
  if (pendingFiles.length === 0) {
    filePreviewBar.classList.add("hidden");
    filePreviewBar.innerHTML = "";
    return;
  }
  filePreviewBar.classList.remove("hidden");
  filePreviewBar.innerHTML = pendingFiles.map((f, i) => `
    <div class="file-preview-item">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
      <span>${escapeHtml(f.name)}</span>
      <span class="remove-file" data-idx="${i}" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </span>
    </div>
  `).join("");

  filePreviewBar.querySelectorAll(".remove-file").forEach(el => {
    el.addEventListener("click", () => {
      pendingFiles.splice(parseInt(el.dataset.idx), 1);
      renderFilePreview();
      updateSendBtn();
    });
  });
}

// ═══ MESSAGES RENDERING ══════════════════════════════════
function renderMessages(msgs) {
  chatMessages.innerHTML = "";
  if (!msgs || msgs.length === 0) {
    chatMessages.appendChild(welcomeScreen.cloneNode(true));
    // rebind suggestion handlers on clone
    chatMessages.querySelectorAll(".suggestion").forEach(btn => {
      btn.addEventListener("click", () => useSuggestion(btn));
    });
    return;
  }
  welcomeScreen.style.display = "none";
  msgs.forEach(m => {
    if (m.role === "user") appendUserMsg(m.content, m.files || []);
    else if (m.role === "assistant") appendBotMsg(m.content);
  });
  scrollToBottom();
}

function appendUserMsg(content, files = []) {
  const div = document.createElement("div");
  div.className = "message user-message";
  let filesHtml = "";
  if (files.length) {
    filesHtml = `<div class="msg-files">${files.map(f =>
      `<span class="msg-file-tag">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
        ${escapeHtml(f)}</span>`
    ).join("")}</div>`;
  }
  div.innerHTML = `
    <div class="msg-content">${filesHtml}${escapeHtml(content)}</div>
    <div class="msg-avatar user">Y</div>`;
  chatMessages.appendChild(div);
}

function appendBotMsg(content) {
  const div = document.createElement("div");
  div.className = "message bot-message";

  // Parse <think> block from saved messages
  const parsed = parseThinkingContent(content);

  let thinkingHtml = "";
  if (parsed.thinking) {
    thinkingHtml = buildThinkingBlockHtml(parsed.thinking, false);
  }

  div.innerHTML = `
    <div class="msg-avatar bot">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
    </div>
    <div class="msg-content">${thinkingHtml}${renderMarkdown(parsed.answer)}</div>`;

  // Attach toggle handler if thinking block exists
  const thinkBlock = div.querySelector(".thinking-block");
  if (thinkBlock) {
    thinkBlock.querySelector(".thinking-header").addEventListener("click", () => {
      thinkBlock.classList.toggle("expanded");
    });
  }

  chatMessages.appendChild(div);
}

function createStreamingBotMsg() {
  const div = document.createElement("div");
  div.className = "message bot-message";
  div.innerHTML = `
    <div class="msg-avatar bot">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
    </div>
    <div class="msg-content">
      <div class="thinking-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div>`;
  chatMessages.appendChild(div);
  scrollToBottom();
  return div.querySelector(".msg-content");
}

// ═══ THINKING HELPERS ════════════════════════════════════

/**
 * Parse raw model output to separate <think>...</think> from the answer.
 */
function parseThinkingContent(raw) {
  if (!raw) return { thinking: "", answer: "" };
  const thinkOpen = raw.indexOf("<think>");
  const thinkClose = raw.indexOf("</think>");

  if (thinkOpen === -1) return { thinking: "", answer: raw };

  const thinkContent = thinkClose !== -1
    ? raw.substring(thinkOpen + 7, thinkClose).trim()
    : raw.substring(thinkOpen + 7).trim();

  const answer = thinkClose !== -1
    ? raw.substring(thinkClose + 8).trim()
    : "";

  return { thinking: thinkContent, answer };
}

/**
 * Build the collapsible thinking block HTML.
 * @param {string} thinkingText - The thinking content
 * @param {boolean} isActive - Whether thinking is still in progress
 */
function buildThinkingBlockHtml(thinkingText, isActive) {
  const activeClass = isActive ? " active" : "";
  const sparkles = isActive
    ? `<div class="thinking-sparkles"><div class="sparkle"></div><div class="sparkle"></div><div class="sparkle"></div></div>`
    : "";
  const label = isActive ? "Thinking…" : "Thought process";
  return `
    <div class="thinking-block${activeClass}">
      <div class="thinking-header">
        <div class="thinking-brain">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z"/><path d="M9 22h6"/></svg>
        </div>
        <span class="thinking-label">${label}${sparkles}</span>
        <svg class="thinking-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="thinking-content">
        <div class="thinking-content-inner">${renderMarkdown(thinkingText)}</div>
      </div>
    </div>`;
}

// ═══ MARKDOWN ════════════════════════════════════════════
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
});

function renderMarkdown(text) {
  if (!text) return "";
  let html = marked.parse(text);
  // Wrap code blocks with header
  html = html.replace(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, (_, lang, code) =>
    `<pre><div class="code-header"><span class="code-lang">${lang}</span><button class="copy-btn" onclick="copyCode(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy</button></div><code class="language-${lang}">${code}</code></pre>`
  );
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) =>
    `<pre><div class="code-header"><span class="code-lang">code</span><button class="copy-btn" onclick="copyCode(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy</button></div><code>${code}</code></pre>`
  );
  return html;
}

function copyCode(btn) {
  const code = btn.closest("pre").querySelector("code").textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.classList.add("copied");
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Copied!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`;
    }, 2000);
  });
}
window.copyCode = copyCode;

// ═══ CHAT SEND ═══════════════════════════════════════════
chatForm.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
  updateSendBtn();
});
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function updateSendBtn() {
  sendBtn.disabled = !(messageInput.value.trim() || pendingFiles.length > 0) || isStreaming;
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if ((!text && pendingFiles.length === 0) || isStreaming) return;

  isStreaming = true;
  updateSendBtn();
  welcomeScreen.style.display = "none";

  // Show user message
  const fileNames = pendingFiles.map(f => f.name);
  if (text) appendUserMsg(text, fileNames);
  else if (fileNames.length) appendUserMsg("[Files attached]", fileNames);

  messageInput.value = "";
  messageInput.style.height = "auto";
  scrollToBottom();

  // Build form data
  const formData = new FormData();
  formData.append("message", text || "");
  if (currentSessionId) formData.append("session_id", currentSessionId);
  if (currentProjectId) formData.append("project_id", currentProjectId);
  if (thinkingMode) formData.append("thinking", "true");
  pendingFiles.forEach(f => formData.append("files", f));
  pendingFiles = [];
  renderFilePreview();

  // Create the bot message container
  const msgDiv = document.createElement("div");
  msgDiv.className = "message bot-message";
  msgDiv.innerHTML = `
    <div class="msg-avatar bot">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
    </div>
    <div class="msg-content">
      <div class="thinking-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div>`;
  chatMessages.appendChild(msgDiv);
  scrollToBottom();
  const contentEl = msgDiv.querySelector(".msg-content");

  let fullText = "";
  let thinkingStartTime = thinkingMode ? Date.now() : null;

  // State machine for parsing <think> tags in real-time
  let phase = thinkingMode ? "waiting-for-think" : "answer";
  // phases: "waiting-for-think" -> "thinking" -> "answer"  OR just "answer" (quick mode)
  let thinkBuffer = "";
  let answerBuffer = "";
  let thinkBlockEl = null;
  let thinkContentInnerEl = null;
  let answerEl = null;

  function initThinkingUI() {
    contentEl.innerHTML = "";
    // Create thinking block
    thinkBlockEl = document.createElement("div");
    thinkBlockEl.className = "thinking-block active expanded";
    thinkBlockEl.innerHTML = `
      <div class="thinking-header">
        <div class="thinking-brain">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z"/><path d="M9 22h6"/></svg>
        </div>
        <span class="thinking-label">Thinking\u2026<div class="thinking-sparkles"><div class="sparkle"></div><div class="sparkle"></div><div class="sparkle"></div></div></span>
        <svg class="thinking-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="thinking-content">
        <div class="thinking-content-inner"></div>
      </div>`;
    contentEl.appendChild(thinkBlockEl);

    // Toggle expand/collapse
    thinkBlockEl.querySelector(".thinking-header").addEventListener("click", () => {
      thinkBlockEl.classList.toggle("expanded");
    });

    thinkContentInnerEl = thinkBlockEl.querySelector(".thinking-content-inner");

    // Answer area (will be populated after thinking is done)
    answerEl = document.createElement("div");
    answerEl.className = "answer-content";
    contentEl.appendChild(answerEl);
  }

  function finalizeThinking() {
    if (!thinkBlockEl) return;
    thinkBlockEl.classList.remove("active");
    thinkBlockEl.classList.remove("expanded");
    // Update label
    const elapsed = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;
    const timeStr = elapsed > 0 ? `<span class="thinking-time">${elapsed}s</span>` : "";
    thinkBlockEl.querySelector(".thinking-label").innerHTML = `Thought process${timeStr}`;
    // Final render of thinking content
    thinkContentInnerEl.innerHTML = renderMarkdown(thinkBuffer);
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/stream`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      contentEl.textContent = err.detail || "Something went wrong. Please try again.";
      isStreaming = false;
      updateSendBtn();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);

          if (obj.type === "session" && obj.session_id) {
            if (!currentSessionId) currentSessionId = obj.session_id;
            if (obj.title) chatTitle.textContent = obj.title;
            continue;
          }

          if (obj.type === "error") {
            // If thinking UI was initialized, finalize it and show error in answer area
            if (thinkBlockEl) {
              finalizeThinking();
              answerEl.innerHTML = `<p style="color:var(--red)">${escapeHtml(obj.detail || "An error occurred.")}</p>`;
            } else {
              contentEl.innerHTML = `<p style="color:var(--red)">${escapeHtml(obj.detail || "An error occurred.")}</p>`;
            }
            continue;
          }

          if (obj.type === "done") continue;

          if (obj.type === "chunk" && obj.content) {
            fullText += obj.content;

            if (phase === "answer" && !thinkingMode) {
              // Quick mode — just render markdown directly
              contentEl.innerHTML = renderMarkdown(fullText);
              scrollToBottom();
              continue;
            }

            // ── Thinking mode state machine ──
            if (phase === "waiting-for-think") {
              // Accumulate until we see <think>
              if (fullText.includes("<think>")) {
                phase = "thinking";
                initThinkingUI();
                const afterTag = fullText.split("<think>").slice(1).join("<think>");
                // Check if </think> already appeared
                if (afterTag.includes("</think>")) {
                  thinkBuffer = afterTag.split("</think>")[0];
                  answerBuffer = afterTag.split("</think>").slice(1).join("</think>");
                  phase = "answer";
                  finalizeThinking();
                  answerEl.innerHTML = renderMarkdown(answerBuffer);
                } else {
                  thinkBuffer = afterTag;
                  thinkContentInnerEl.innerHTML = renderMarkdown(thinkBuffer);
                }
                scrollToBottom();
              }
              // If no <think> tag found yet, just show the loading dots
              continue;
            }

            if (phase === "thinking") {
              // Re-derive thinkBuffer from fullText
              const afterOpen = fullText.split("<think>").slice(1).join("<think>");
              if (afterOpen.includes("</think>")) {
                thinkBuffer = afterOpen.split("</think>")[0];
                answerBuffer = afterOpen.split("</think>").slice(1).join("</think>");
                phase = "answer";
                finalizeThinking();
                answerEl.innerHTML = renderMarkdown(answerBuffer);
              } else {
                thinkBuffer = afterOpen;
                thinkContentInnerEl.innerHTML = renderMarkdown(thinkBuffer);
              }
              scrollToBottom();
              continue;
            }

            if (phase === "answer" && thinkingMode) {
              // Re-derive answer from fullText
              const afterOpen = fullText.split("<think>").slice(1).join("<think>");
              if (afterOpen.includes("</think>")) {
                answerBuffer = afterOpen.split("</think>").slice(1).join("</think>");
                answerEl.innerHTML = renderMarkdown(answerBuffer);
              }
              scrollToBottom();
              continue;
            }
          }

          // Legacy format support (old SSE format)
          if (obj.session_id && !currentSessionId) {
            currentSessionId = obj.session_id;
          }
          if (obj.title) {
            chatTitle.textContent = obj.title;
          }
          if (obj.token) {
            fullText += obj.token;
            contentEl.innerHTML = renderMarkdown(fullText);
            scrollToBottom();
          }
        } catch (_) { /* ignore parse errors */ }
      }
    }
  } catch (e) {
    if (thinkBlockEl) {
      finalizeThinking();
      answerEl.innerHTML = `<p style="color:var(--red)">Connection lost. Please try again.</p>`;
    } else {
      contentEl.innerHTML = `<p style="color:var(--red)">Connection lost. Please try again.</p>`;
    }
    console.error("stream error:", e);
  }

  // If thinking mode was on but model never produced </think>, finalize gracefully
  if (thinkingMode && phase === "thinking" && thinkBlockEl) {
    finalizeThinking();
    // Try to parse whatever we have
    const parsed = parseThinkingContent(fullText);
    if (parsed.answer) {
      answerEl.innerHTML = renderMarkdown(parsed.answer);
    }
  }

  // If thinking mode but model never even started <think>, render as normal
  if (thinkingMode && phase === "waiting-for-think") {
    contentEl.innerHTML = renderMarkdown(fullText);
  }

  isStreaming = false;
  updateSendBtn();
  loadSessions();
}

// ═══ NEW CHAT ════════════════════════════════════════════
function newChat() {
  currentSessionId = null;
  chatTitle.textContent = "New Chat";
  chatMessages.innerHTML = "";
  welcomeScreen.style.display = "";
  chatMessages.appendChild(welcomeScreen);
  welcomeScreen.querySelectorAll(".suggestion").forEach(btn => {
    btn.onclick = () => useSuggestion(btn);
  });
  renderSessionList(searchInput.value);
}
newChatBtn.addEventListener("click", () => { newChat(); closeSidebar(); });

// ═══ SEARCH ══════════════════════════════════════════════
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => renderSessionList(searchInput.value), 200);
});

// ═══ SUGGESTION ══════════════════════════════════════════
function useSuggestion(btn) {
  const text = btn.getAttribute("data-text") || btn.dataset.text;
  if (text) {
    messageInput.value = text;
    messageInput.dispatchEvent(new Event("input"));
    sendMessage();
  }
}
window.useSuggestion = useSuggestion;

// ═══ HELPERS ═════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ═══ INIT ════════════════════════════════════════════════
(async function init() {
  await Promise.all([loadSessions(), loadProjects()]);
})();
