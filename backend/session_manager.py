"""In-memory session & project manager with automatic cleanup."""

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

    def __init__(self, session_id: Optional[str] = None, title: str = "New Chat",
                 project_id: Optional[str] = None):
        self.session_id = session_id or uuid.uuid4().hex
        self.title = title
        self.project_id = project_id
        self.messages: List[Message] = []
        self.created_at = datetime.utcnow().isoformat()
        self.updated_at = self.created_at

    def add_message(self, role: str, content: str) -> Message:
        msg = Message(role, content)
        self.messages.append(msg)
        self.updated_at = datetime.utcnow().isoformat()

        max_msgs = settings.MAX_HISTORY_PER_SESSION * 2
        if len(self.messages) > max_msgs:
            self.messages = self.messages[-max_msgs:]

        return msg

    def get_api_messages(self, project_instructions: str = "") -> List[Dict[str, str]]:
        """Return the conversation formatted for the Mistral API."""
        system_content = settings.SYSTEM_PROMPT
        if project_instructions:
            system_content += (
                "\n\n=== PROJECT-SPECIFIC INSTRUCTIONS (provided by the user for this project) ===\n"
                f"{project_instructions}\n"
                "=== END PROJECT INSTRUCTIONS ===\n"
            )
        system = [{"role": "system", "content": system_content}]
        history = [m.to_api_format() for m in self.messages]
        return system + history

    def auto_title(self, first_user_msg: str) -> None:
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
            "project_id": self.project_id,
        }

    def to_detail(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "title": self.title,
            "messages": [m.to_dict() for m in self.messages],
            "project_id": self.project_id,
        }


class Project:
    """A project groups conversations under shared instructions."""

    def __init__(self, project_id: Optional[str] = None, name: str = "New Project",
                 instructions: str = ""):
        self.project_id = project_id or uuid.uuid4().hex
        self.name = name
        self.instructions = instructions
        self.created_at = datetime.utcnow().isoformat()
        self.updated_at = self.created_at

    def to_info(self, session_count: int = 0) -> Dict[str, Any]:
        return {
            "project_id": self.project_id,
            "name": self.name,
            "instructions": self.instructions,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "session_count": session_count,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "instructions": self.instructions,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class SessionManager:
    """Thread-safe in-memory session & project store with optional JSON persistence."""

    _PERSIST_FILE = Path(__file__).resolve().parent / "_sessions.json"

    def __init__(self, persist: bool = True):
        self._sessions: Dict[str, Session] = {}
        self._projects: Dict[str, Project] = {}
        self._lock = Lock()
        self._persist = persist
        if persist:
            self._load()

    # ── Session API ─────────────────────────────────────────

    def create_session(self, project_id: Optional[str] = None) -> Session:
        session = Session(project_id=project_id)
        with self._lock:
            self._sessions[session.session_id] = session
            self._save()
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        with self._lock:
            return self._sessions.get(session_id)

    def get_or_create(self, session_id: Optional[str], project_id: Optional[str] = None) -> Session:
        if session_id:
            s = self.get_session(session_id)
            if s:
                return s
        return self.create_session(project_id=project_id)

    def list_sessions(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            if project_id:
                infos = [s.to_info() for s in self._sessions.values() if s.project_id == project_id]
            else:
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

    # ── Project API ─────────────────────────────────────────

    def create_project(self, name: str, instructions: str = "") -> Project:
        project = Project(name=name, instructions=instructions)
        with self._lock:
            self._projects[project.project_id] = project
            self._save()
        return project

    def get_project(self, project_id: str) -> Optional[Project]:
        with self._lock:
            return self._projects.get(project_id)

    def list_projects(self) -> List[Dict[str, Any]]:
        with self._lock:
            result = []
            for p in self._projects.values():
                count = sum(1 for s in self._sessions.values() if s.project_id == p.project_id)
                result.append(p.to_info(session_count=count))
        result.sort(key=lambda x: x["updated_at"], reverse=True)
        return result

    def update_project(self, project_id: str, name: Optional[str] = None,
                       instructions: Optional[str] = None) -> bool:
        with self._lock:
            p = self._projects.get(project_id)
            if not p:
                return False
            if name is not None:
                p.name = name
            if instructions is not None:
                p.instructions = instructions
            p.updated_at = datetime.utcnow().isoformat()
            self._save()
            return True

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            removed = self._projects.pop(project_id, None)
            if not removed:
                return False
            # Delete all sessions under this project
            to_remove = [sid for sid, s in self._sessions.items() if s.project_id == project_id]
            for sid in to_remove:
                del self._sessions[sid]
            self._save()
            return True

    def get_project_instructions(self, project_id: Optional[str]) -> str:
        """Get instructions for a project (empty string if no project)."""
        if not project_id:
            return ""
        with self._lock:
            p = self._projects.get(project_id)
            return p.instructions if p else ""

    # ── Persistence helpers ─────────────────────────────────

    def _save(self) -> None:
        if not self._persist:
            return
        data = {"sessions": {}, "projects": {}}
        for sid, s in self._sessions.items():
            data["sessions"][sid] = {
                "title": s.title,
                "project_id": s.project_id,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "messages": [m.to_dict() for m in s.messages],
            }
        for pid, p in self._projects.items():
            data["projects"][pid] = p.to_dict()
        self._PERSIST_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _load(self) -> None:
        if not self._PERSIST_FILE.exists():
            return
        try:
            data = json.loads(self._PERSIST_FILE.read_text(encoding="utf-8"))

            # Handle legacy format (flat dict of sessions)
            if "sessions" not in data and "projects" not in data:
                sessions_data = data
                projects_data = {}
            else:
                sessions_data = data.get("sessions", {})
                projects_data = data.get("projects", {})

            for sid, info in sessions_data.items():
                session = Session(
                    session_id=sid,
                    title=info.get("title", "New Chat"),
                    project_id=info.get("project_id"),
                )
                session.created_at = info.get("created_at", session.created_at)
                session.updated_at = info.get("updated_at", session.updated_at)
                for m in info.get("messages", []):
                    msg = Message(m["role"], m["content"], m.get("timestamp"))
                    session.messages.append(msg)
                self._sessions[sid] = session

            for pid, pinfo in projects_data.items():
                project = Project(
                    project_id=pid,
                    name=pinfo.get("name", "Project"),
                    instructions=pinfo.get("instructions", ""),
                )
                project.created_at = pinfo.get("created_at", project.created_at)
                project.updated_at = pinfo.get("updated_at", project.updated_at)
                self._projects[pid] = project

        except Exception:
            pass  # corrupted file — start fresh


# Singleton
session_manager = SessionManager()
