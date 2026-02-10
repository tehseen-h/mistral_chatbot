/* ═══════════════════════════════════════════════════════════
   Mistral Chatbot — Frontend Application Logic
   ═══════════════════════════════════════════════════════════ */

const API = window.location.origin;

// ── State ──────────────────────────────────────────────────
let currentSessionId = null;
let isStreaming = false;
let abortController = null;

// ── DOM refs ───────────────────────────────────────────────
const $messages    = document.getElementById('chatMessages');
const $form        = document.getElementById('chatForm');
const $input       = document.getElementById('messageInput');
const $sendBtn     = document.getElementById('sendBtn');
const $sessionList = document.getElementById('sessionList');
const $chatTitle   = document.getElementById('chatTitle');
const $welcome     = document.getElementById('welcomeScreen');
const $sidebar     = document.getElementById('sidebar');
const $overlay     = document.getElementById('sidebarOverlay');
const $menuBtn     = document.getElementById('menuBtn');
const $newChatBtn  = document.getElementById('newChatBtn');
const $themeToggle = document.getElementById('themeToggle');
const $deleteChatBtn = document.getElementById('deleteChatBtn');

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
    $sendBtn.disabled = !$input.value.trim();
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
// SEND MESSAGE (streaming)
// ═══════════════════════════════════════════════════════════
async function sendMessage() {
  const text = $input.value.trim();
  if (!text || isStreaming) return;

  // Remove welcome screen
  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.remove();

  // Show user message
  appendMessage('user', text, new Date().toISOString(), true);

  // Reset input
  $input.value = '';
  $input.style.height = 'auto';
  $sendBtn.disabled = true;

  // Show typing indicator
  const typingEl = showTypingIndicator();

  isStreaming = true;
  abortController = new AbortController();

  try {
    const res = await fetch(`${API}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, session_id: currentSessionId }),
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
      buffer = lines.pop(); // keep incomplete line

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
    $sendBtn.disabled = !$input.value.trim();
  }
}

// ═══════════════════════════════════════════════════════════
// MESSAGE RENDERING
// ═══════════════════════════════════════════════════════════
function appendMessage(role, content, timestamp, animate = true) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  if (!animate) row.style.animation = 'none';

  const avatarText = role === 'user' ? 'You' : 'AI';

  const contentHtml = role === 'assistant' && content
    ? renderMarkdown(content)
    : escapeHtml(content);

  row.innerHTML = `
    <div class="message-avatar">${avatarText}</div>
    <div class="message-body">
      <div class="message-content">${contentHtml}</div>
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
