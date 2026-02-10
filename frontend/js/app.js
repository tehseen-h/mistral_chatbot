/* ═══════════════════════════════════════════════════════════
   Mistral AI — Frontend Application Logic
   ═══════════════════════════════════════════════════════════ */

// ── API Base URL ───────────────────────────────────────────
const BACKEND_URL = "https://web-production-de319.up.railway.app";
const API = BACKEND_URL || window.location.origin;

// ── State ──────────────────────────────────────────────────
let currentSessionId = null;
let isStreaming = false;
let abortController = null;
let pendingFiles = [];

// ── DOM refs ───────────────────────────────────────────────
const $messages      = document.getElementById('chatMessages');
const $form          = document.getElementById('chatForm');
const $input         = document.getElementById('messageInput');
const $sendBtn       = document.getElementById('sendBtn');
const $sessionList   = document.getElementById('sessionList');
const $chatTitle     = document.getElementById('chatTitle');
const $welcome       = document.getElementById('welcomeScreen');
const $sidebar       = document.getElementById('sidebar');
const $overlay       = document.getElementById('sidebarOverlay');
const $menuBtn       = document.getElementById('menuBtn');
const $newChatBtn    = document.getElementById('newChatBtn');
const $themeToggle   = document.getElementById('themeToggle');
const $deleteChatBtn = document.getElementById('deleteChatBtn');
const $fileInput     = document.getElementById('fileInput');
const $attachBtn     = document.getElementById('attachBtn');
const $filePreview   = document.getElementById('filePreviewBar');
const $searchInput   = document.getElementById('searchInput');

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadSessions();
  setupEventListeners();
});

// ═══════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateHljsTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateHljsTheme(next);

  // Re-initialize lucide icons after theme change
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateHljsTheme(theme) {
  const link = document.getElementById('hljs-theme');
  if (!link) return;
  link.href = theme === 'dark'
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════
function setupEventListeners() {
  $form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  // Auto-resize textarea with smooth animation
  $input.addEventListener('input', () => {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 160) + 'px';
    updateSendButton();
  });

  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ($input.value.trim() && !isStreaming) sendMessage();
    }
  });

  // Sidebar
  $menuBtn.addEventListener('click', () => {
    $sidebar.classList.toggle('open');
    $overlay.classList.toggle('active');
  });

  $overlay.addEventListener('click', closeSidebar);

  $newChatBtn.addEventListener('click', () => {
    startNewChat();
    closeSidebar();
  });

  $themeToggle.addEventListener('click', toggleTheme);
  $deleteChatBtn.addEventListener('click', deleteCurrentChat);

  // File attachment
  $attachBtn.addEventListener('click', () => $fileInput.click());
  $fileInput.addEventListener('change', handleFileSelect);

  // Search sessions
  if ($searchInput) {
    $searchInput.addEventListener('input', debounce(() => {
      filterSessions($searchInput.value.trim());
    }, 200));
  }
}

function closeSidebar() {
  $sidebar.classList.remove('open');
  $overlay.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════
let allSessions = [];

async function loadSessions() {
  try {
    const res = await fetch(`${API}/api/sessions`);
    const data = await res.json();
    allSessions = data.sessions;
    renderSessionList(allSessions);
  } catch (e) {
    console.error('Failed to load sessions', e);
  }
}

function filterSessions(query) {
  if (!query) {
    renderSessionList(allSessions);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allSessions.filter(s => s.title.toLowerCase().includes(q));
  renderSessionList(filtered);
}

function renderSessionList(sessions) {
  $sessionList.innerHTML = '';

  if (sessions.length === 0) {
    $sessionList.innerHTML = `
      <div style="padding:32px 16px;text-align:center;color:var(--text-tertiary);font-size:.82rem;">
        <div style="margin-bottom:8px;opacity:0.5;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        No conversations yet
      </div>`;
    return;
  }

  sessions.forEach((s, idx) => {
    const btn = document.createElement('button');
    btn.className = `session-item${s.session_id === currentSessionId ? ' active' : ''}`;
    btn.style.animationDelay = `${idx * 30}ms`;
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="session-title">${escapeHtml(s.title)}</span>`;
    btn.addEventListener('click', () => {
      loadSession(s.session_id);
      closeSidebar();
    });
    $sessionList.appendChild(btn);
  });
}

async function loadSession(sessionId) {
  try {
    const res = await fetch(`${API}/api/sessions/${sessionId}`);
    if (!res.ok) throw new Error('Session not found');
    const data = await res.json();

    currentSessionId = sessionId;
    $chatTitle.textContent = data.title;
    $messages.innerHTML = '';

    data.messages.forEach((m) => {
      appendMessage(m.role, m.content, m.timestamp, false);
    });

    scrollToBottom();
    highlightActiveSession();
    $welcome?.remove();
  } catch (e) {
    showError('Failed to load session');
  }
}

function startNewChat() {
  currentSessionId = null;
  $chatTitle.textContent = 'New Chat';
  $messages.innerHTML = '';

  $messages.innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-glow"></div>
      <div class="welcome-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
        </svg>
      </div>
      <h2>Hello, how can I help?</h2>
      <p>I'm Mistral, a powerful AI assistant. Ask me anything — from coding to creative writing.</p>
      <div class="suggestions">
        <button class="suggestion" onclick="useSuggestion(this)" data-text="Explain quantum computing in simple terms anyone can understand">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/></svg>
          <div>
            <strong>Explain quantum computing</strong>
            <span>in simple terms anyone can understand</span>
          </div>
        </button>
        <button class="suggestion" onclick="useSuggestion(this)" data-text="Write a Python function to sort a list efficiently">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
          <div>
            <strong>Write a Python function</strong>
            <span>to sort a list efficiently</span>
          </div>
        </button>
        <button class="suggestion" onclick="useSuggestion(this)" data-text="What are the best practices for REST API design?">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
          <div>
            <strong>REST API best practices</strong>
            <span>design patterns and conventions</span>
          </div>
        </button>
        <button class="suggestion" onclick="useSuggestion(this)" data-text="Help me debug a JavaScript async issue with promises">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>
          <div>
            <strong>Debug JavaScript async</strong>
            <span>help me fix promise and await issues</span>
          </div>
        </button>
      </div>
    </div>`;

  highlightActiveSession();
}

async function deleteCurrentChat() {
  if (!currentSessionId) return;
  if (!confirm('Delete this conversation?')) return;

  try {
    await fetch(`${API}/api/sessions/${currentSessionId}`, { method: 'DELETE' });
    startNewChat();
    loadSessions();
  } catch (e) {
    showError('Failed to delete session');
  }
}

function highlightActiveSession() {
  document.querySelectorAll('.session-item').forEach((el) => el.classList.remove('active'));
  loadSessions();
}

// ═══════════════════════════════════════════════════════════
// FILE HANDLING
// ═══════════════════════════════════════════════════════════
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  for (const file of files) {
    if (file.size > 100 * 1024 * 1024) {
      showError(`"${file.name}" exceeds 100 MB limit.`);
      continue;
    }
    const entry = {
      file,
      status: 'uploading',
      file_id: null,
      filename: file.name,
      category: guessCategory(file.name),
      size: file.size,
    };
    pendingFiles.push(entry);
    uploadFile(entry);
  }

  renderFilePreview();
  updateSendButton();
  $fileInput.value = '';
}

function guessCategory(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'document';
  return 'text';
}

async function uploadFile(entry) {
  const formData = new FormData();
  formData.append('file', entry.file);

  try {
    const res = await fetch(`${API}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed (${res.status})`);
    }

    const data = await res.json();
    entry.status = 'done';
    entry.file_id = data.file_id;
    entry.category = data.category;
  } catch (e) {
    entry.status = 'error';
    showError(`Upload failed: ${e.message}`);
  }

  renderFilePreview();
  updateSendButton();
}

function removeFile(index) {
  pendingFiles.splice(index, 1);
  renderFilePreview();
  updateSendButton();
}

function renderFilePreview() {
  if (pendingFiles.length === 0) {
    $filePreview.classList.add('hidden');
    $filePreview.innerHTML = '';
    return;
  }

  $filePreview.classList.remove('hidden');
  $filePreview.innerHTML = pendingFiles.map((f, i) => {
    const icon = f.category === 'image'
      ? `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
      : `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    let statusHtml = '';
    if (f.status === 'uploading') statusHtml = '<div class="spinner"></div>';
    else if (f.status === 'done') statusHtml = '<span class="file-status done">✓</span>';
    else if (f.status === 'error') statusHtml = '<span class="file-status error">✗</span>';

    return `<div class="file-chip">
      ${icon}
      <span class="file-name">${escapeHtml(f.filename)}</span>
      <span class="file-size">${formatFileSize(f.size)}</span>
      ${statusHtml}
      <button type="button" class="remove-file" onclick="removeFile(${i})" title="Remove">×</button>
    </div>`;
  }).join('');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateSendButton() {
  const hasText = $input.value.trim().length > 0;
  const hasFiles = pendingFiles.length > 0;
  const allUploaded = pendingFiles.every(f => f.status === 'done');
  const anyFile = hasFiles && allUploaded;
  $sendBtn.disabled = isStreaming || (!hasText && !anyFile) || (hasFiles && !allUploaded);
}

// ═══════════════════════════════════════════════════════════
// SEND MESSAGE (streaming)
// ═══════════════════════════════════════════════════════════
async function sendMessage() {
  const text = $input.value.trim();
  const fileIds = pendingFiles.filter(f => f.status === 'done').map(f => f.file_id);
  const fileInfos = pendingFiles.filter(f => f.status === 'done').map(f => ({ filename: f.filename, category: f.category }));

  if (!text && fileIds.length === 0) return;
  if (isStreaming) return;

  const welcome = document.getElementById('welcomeScreen');
  if (welcome) {
    welcome.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => welcome.remove(), 300);
  }

  appendMessage('user', text, new Date().toISOString(), true, fileInfos);

  $input.value = '';
  $input.style.height = 'auto';
  pendingFiles = [];
  renderFilePreview();
  $sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  isStreaming = true;
  abortController = new AbortController();

  try {
    const body = { message: text || '(see attached file)', session_id: currentSessionId };
    if (fileIds.length > 0) body.file_ids = fileIds;

    const res = await fetch(`${API}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    typingEl.remove();

    const { contentEl, timeEl } = appendMessage('assistant', '', '', true);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        let payload;
        try { payload = JSON.parse(raw); } catch { continue; }

        if (payload.type === 'session') {
          currentSessionId = payload.session_id;
        } else if (payload.type === 'chunk') {
          fullText += payload.content;
          contentEl.innerHTML = renderMarkdown(fullText);
          highlightCodeBlocks(contentEl);
          scrollToBottom();
        } else if (payload.type === 'done') {
          if (payload.message?.timestamp) {
            timeEl.textContent = formatTime(payload.message.timestamp);
          }
          loadSessions();
        } else if (payload.type === 'error') {
          throw new Error(payload.detail);
        }
      }
    }
  } catch (e) {
    typingEl?.remove();
    if (e.name !== 'AbortError') {
      showError(e.message || 'Something went wrong');
    }
  } finally {
    isStreaming = false;
    abortController = null;
    updateSendButton();
  }
}

// ═══════════════════════════════════════════════════════════
// MESSAGE RENDERING
// ═══════════════════════════════════════════════════════════
function appendMessage(role, content, timestamp, animate = true, files = []) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  if (!animate) row.style.animation = 'none';

  const avatarHtml = role === 'user'
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';

  let filesHtml = '';
  if (files && files.length > 0) {
    const tags = files.map(f => {
      const icon = f.category === 'image'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      return `<span class="message-file-tag">${icon} ${escapeHtml(f.filename)}</span>`;
    }).join('');
    filesHtml = `<div class="message-files">${tags}</div>`;
  }

  const contentHtml = role === 'assistant' && content
    ? renderMarkdown(content)
    : escapeHtml(content);

  row.innerHTML = `
    <div class="message-avatar">${avatarHtml}</div>
    <div class="message-body">
      <div class="message-content">${filesHtml}${contentHtml}</div>
      <div class="message-time">${timestamp ? formatTime(timestamp) : ''}</div>
    </div>`;

  $messages.appendChild(row);

  if (role === 'assistant' && content) {
    const contentEl = row.querySelector('.message-content');
    highlightCodeBlocks(contentEl);
  }

  scrollToBottom();

  return {
    contentEl: row.querySelector('.message-content'),
    timeEl: row.querySelector('.message-time'),
  };
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'typingIndicator';
  row.innerHTML = `
    <div class="message-avatar">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      </svg>
    </div>
    <div class="message-body">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  $messages.appendChild(row);
  scrollToBottom();
  return row;
}

// ═══════════════════════════════════════════════════════════
// MARKDOWN
// ═══════════════════════════════════════════════════════════
function renderMarkdown(text) {
  if (typeof marked === 'undefined') return escapeHtml(text);

  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: (code, lang) => {
      if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return code;
    },
  });

  return marked.parse(text);
}

function highlightCodeBlocks(container) {
  if (!container) return;

  container.querySelectorAll('pre code').forEach((block) => {
    if (block.dataset.highlighted) return;
    block.dataset.highlighted = 'true';

    const lang = [...block.classList]
      .find(c => c.startsWith('language-'))
      ?.replace('language-', '') || '';

    const pre = block.parentElement;
    if (pre && !pre.querySelector('.code-header')) {
      const header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML = `
        <span>${lang || 'code'}</span>
        <button class="copy-btn" onclick="copyCode(this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </button>`;
      pre.insertBefore(header, block);
    }

    if (typeof hljs !== 'undefined') {
      try { hljs.highlightElement(block); } catch {}
    }
  });
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    $messages.scrollTo({
      top: $messages.scrollHeight,
      behavior: 'smooth'
    });
  });
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function copyCode(btn) {
  const code = btn.closest('pre').querySelector('code');
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!`;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy`;
      btn.classList.remove('copied');
    }, 2000);
  });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Suggestion buttons
function useSuggestion(btn) {
  const text = btn.dataset.text || btn.querySelector('strong')?.textContent || btn.textContent;
  $input.value = text;
  $sendBtn.disabled = false;
  $input.focus();
  sendMessage();
}

// Additional CSS keyframe (injected via JS for fadeOut)
const styleSheet = document.createElement('style');
styleSheet.textContent = `@keyframes fadeOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-8px); } }`;
document.head.appendChild(styleSheet);
