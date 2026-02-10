"""In-memory session manager with automatic cleanup."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

from config import settings


class Message:
    """Single chat message."""

    def __init__(self, role: str, content: str, timestamp: Optional[str] = None):
        self.role = role
        self.content = content
        self.timestamp = timestamp or datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content, "timestamp": self.timestamp}

    def to_api_format(self) -> Dict[str, str]:
        """Format expected by the Mistral API (role + content only)."""
        return {"role": self.role, "content": self.content}


class Session:
    """Single conversation session."""

    def __init__(self, session_id: Optional[str] = None, title: str = "New Chat"):
        self.session_id = session_id or uuid.uuid4().hex
        self.title = title
        self.messages: List[Message] = []
        self.created_at = datetime.utcnow().isoformat()
        self.updated_at = self.created_at

    def add_message(self, role: str, content: str) -> Message:
        msg = Message(role, content)
        self.messages.append(msg)
        self.updated_at = datetime.utcnow().isoformat()

        # Trim old messages to stay within budget (keep system prompt safe)
        max_msgs = settings.MAX_HISTORY_PER_SESSION * 2  # pairs
        if len(self.messages) > max_msgs:
            self.messages = self.messages[-max_msgs:]

        return msg

    def get_api_messages(self) -> List[Dict[str, str]]:
        """Return the conversation formatted for the Mistral API."""
        system = [{"role": "system", "content": settings.SYSTEM_PROMPT}]
        history = [m.to_api_format() for m in self.messages]
        return system + history

    def auto_title(self, first_user_msg: str) -> None:
        """Generate a short title from the first user message."""
        self.title = first_user_msg[:60].strip() or "New Chat"
        if len(first_user_msg) > 60:
            self.title += "…"

    def to_info(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "title": self.title,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "message_count": len(self.messages),
        }

    def to_detail(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "title": self.title,
            "messages": [m.to_dict() for m in self.messages],
        }


class SessionManager:
    """Thread-safe in-memory session store with optional JSON persistence."""

    _PERSIST_FILE = Path(__file__).resolve().parent / "_sessions.json"

    def __init__(self, persist: bool = True):
        self._sessions: Dict[str, Session] = {}
        self._lock = Lock()
        self._persist = persist
        if persist:
            self._load()

    # ── public API ──────────────────────────────────────────

    def create_session(self) -> Session:
        session = Session()
        with self._lock:
            self._sessions[session.session_id] = session
            self._save()
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        with self._lock:
            return self._sessions.get(session_id)

    def get_or_create(self, session_id: Optional[str]) -> Session:
        if session_id:
            s = self.get_session(session_id)
            if s:
                return s
        return self.create_session()

    def list_sessions(self) -> List[Dict[str, Any]]:
        with self._lock:
            infos = [s.to_info() for s in self._sessions.values()]
        infos.sort(key=lambda x: x["updated_at"], reverse=True)
        return infos

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            removed = self._sessions.pop(session_id, None)
            if removed:
                self._save()
            return removed is not None

    def rename_session(self, session_id: str, title: str) -> bool:
        with self._lock:
            s = self._sessions.get(session_id)
            if not s:
                return False
            s.title = title
            self._save()
            return True

    def save(self) -> None:
        with self._lock:
            self._save()

    # ── persistence helpers ─────────────────────────────────

    def _save(self) -> None:
        if not self._persist:
            return
        data = {}
        for sid, s in self._sessions.items():
            data[sid] = {
                "title": s.title,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "messages": [m.to_dict() for m in s.messages],
            }
        self._PERSIST_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _load(self) -> None:
        if not self._PERSIST_FILE.exists():
            return
        try:
            data = json.loads(self._PERSIST_FILE.read_text(encoding="utf-8"))
            for sid, info in data.items():
                session = Session(session_id=sid, title=info.get("title", "New Chat"))
                session.created_at = info.get("created_at", session.created_at)
                session.updated_at = info.get("updated_at", session.updated_at)
                for m in info.get("messages", []):
                    msg = Message(m["role"], m["content"], m.get("timestamp"))
                    session.messages.append(msg)
                self._sessions[sid] = session
        except Exception:
            pass  # corrupted file — start fresh


# Singleton
session_manager = SessionManager()
