/* ═══════════════════════════════════════════════════════════
   Mistral Chatbot — Frontend Application Logic
   ═══════════════════════════════════════════════════════════ */

// ── API Base URL ───────────────────────────────────────────
// For LOCAL dev  : leave empty (same-origin)
// For PRODUCTION : set to your Railway backend URL, e.g.
//   "https://your-app.up.railway.app"
const BACKEND_URL = "https://web-production-de319.up.railway.app";

const API = BACKEND_URL || window.location.origin;

// ── State ──────────────────────────────────────────────────
let currentSessionId = null;
let isStreaming = false;
let abortController = null;
let pendingFiles = [];  // { file, status, file_id, filename, category, size }

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
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════
function setupEventListeners() {
  // Form submit
  $form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  // Auto-resize textarea
  $input.addEventListener('input', () => {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 160) + 'px';
    updateSendButton();
  });

  // Keyboard: Enter to send, Shift+Enter for newline
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
}

function closeSidebar() {
  $sidebar.classList.remove('open');
  $overlay.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════
async function loadSessions() {
  try {
    const res = await fetch(`${API}/api/sessions`);
    const data = await res.json();
    renderSessionList(data.sessions);
  } catch (e) {
    console.error('Failed to load sessions', e);
  }
}

function renderSessionList(sessions) {
  $sessionList.innerHTML = '';
  if (sessions.length === 0) {
    $sessionList.innerHTML = `
      <div style="padding:24px 12px;text-align:center;color:var(--text-tertiary);font-size:.8rem;">
        No conversations yet
      </div>`;
    return;
  }

  sessions.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = `session-item${s.session_id === currentSessionId ? ' active' : ''}`;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

    // Clear messages area
    $messages.innerHTML = '';

    // Render all messages
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

  // Re-add welcome screen
  $messages.innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h2>Welcome to Mistral Chat</h2>
      <p>Start a conversation with one of the world's most capable AI models.</p>
      <div class="suggestions">
        <button class="suggestion" onclick="useSuggestion(this)">Explain quantum computing in simple terms</button>
        <button class="suggestion" onclick="useSuggestion(this)">Write a Python function to sort a list</button>
        <button class="suggestion" onclick="useSuggestion(this)">What are the best practices for REST API design?</button>
        <button class="suggestion" onclick="useSuggestion(this)">Help me debug a JavaScript async issue</button>
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
  if (currentSessionId) {
    document.querySelectorAll('.session-item').forEach((el) => {
      const title = el.querySelector('.session-title');
      // re-highlight from list refresh instead
    });
  }
  loadSessions(); // refresh active state
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

  // Remove welcome screen
  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.remove();

  // Show user message with file badges
  appendMessage('user', text, new Date().toISOString(), true, fileInfos);

  // Reset input & files
  $input.value = '';
  $input.style.height = 'auto';
  pendingFiles = [];
  renderFilePreview();
  $sendBtn.disabled = true;

  // Show typing indicator
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

    // Remove typing indicator
    typingEl.remove();

    // Create assistant message placeholder
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

  const avatarText = role === 'user' ? 'You' : 'AI';

  // Build file badges HTML
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
    <div class="message-avatar">${avatarText}</div>
    <div class="message-body">
      <div class="message-content">${filesHtml}${contentHtml}</div>
      <div class="message-time">${timestamp ? formatTime(timestamp) : ''}</div>
    </div>`;

  $messages.appendChild(row);

  // Highlight code blocks in assistant messages
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
    <div class="message-avatar">AI</div>
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
    // Only process once
    if (block.dataset.highlighted) return;
    block.dataset.highlighted = 'true';

    // Detect language
    const lang = [...block.classList]
      .find(c => c.startsWith('language-'))
      ?.replace('language-', '') || '';

    // Add header with copy button
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

    // Apply hljs
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
    $messages.scrollTop = $messages.scrollHeight;
  });
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
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

// Suggestion buttons
function useSuggestion(btn) {
  $input.value = btn.textContent;
  $sendBtn.disabled = false;
  $input.focus();
  sendMessage();
}
