"""File processing utilities — handles text, image, and PDF uploads."""

from __future__ import annotations

import base64
import io
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

# ── Supported file types ────────────────────────────────────
ALLOWED_TEXT_EXTENSIONS = {
    ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css",
    ".json", ".xml", ".yaml", ".yml", ".md", ".csv", ".log",
    ".sh", ".bat", ".ps1", ".sql", ".r", ".java", ".c", ".cpp",
    ".h", ".hpp", ".cs", ".go", ".rs", ".php", ".rb", ".swift",
    ".kt", ".scala", ".ini", ".cfg", ".toml", ".env", ".gitignore",
    ".dockerfile", ".vue", ".svelte", ".dart", ".lua", ".pl",
    ".ex", ".exs", ".hs", ".ml", ".clj", ".erl", ".zig",
}

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}

ALLOWED_DOC_EXTENSIONS = {".pdf"}

ALL_ALLOWED = ALLOWED_TEXT_EXTENSIONS | ALLOWED_IMAGE_EXTENSIONS | ALLOWED_DOC_EXTENSIONS

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


def get_file_category(filename: str) -> str:
    """Return 'text', 'image', 'document', or 'unknown'."""
    ext = Path(filename).suffix.lower()
    if ext in ALLOWED_TEXT_EXTENSIONS:
        return "text"
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    if ext in ALLOWED_DOC_EXTENSIONS:
        return "document"
    return "unknown"


def _read_text(content: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return content.decode(enc)
        except (UnicodeDecodeError, ValueError):
            continue
    return content.decode("utf-8", errors="replace")


def _read_image_b64(content: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }
    mime = mime_map.get(ext, "image/png")
    b64 = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _read_pdf(content: bytes) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages) if pages else "(Empty PDF — no extractable text)"
    except ImportError:
        return "(PDF processing unavailable — pypdf not installed)"
    except Exception as e:
        return f"(Failed to read PDF: {e})"


def process_file(content: bytes, filename: str) -> Dict[str, Any]:
    """Process an uploaded file and return its metadata + extracted content."""
    category = get_file_category(filename)

    if category == "text":
        text = _read_text(content)
        return {
            "category": "text",
            "filename": filename,
            "text_content": text,
            "size": len(content),
        }
    elif category == "image":
        data_url = _read_image_b64(content, filename)
        return {
            "category": "image",
            "filename": filename,
            "data_url": data_url,
            "size": len(content),
        }
    elif category == "document":
        text = _read_pdf(content)
        return {
            "category": "text",
            "filename": filename,
            "text_content": text,
            "size": len(content),
        }
    else:
        # Attempt text fallback
        try:
            text = content.decode("utf-8")
            return {
                "category": "text",
                "filename": filename,
                "text_content": text,
                "size": len(content),
            }
        except UnicodeDecodeError:
            raise ValueError(
                f"Unsupported file type: {Path(filename).suffix}. "
                "Supported: text/code files, images (png/jpg/gif/webp), and PDFs."
            )


# ═══════════════════════════════════════════════════════════
# Temporary file store (TTL = 1 hour)
# ═══════════════════════════════════════════════════════════
class FileStore:
    """Thread-safe in-memory cache for processed uploads."""

    def __init__(self, ttl_minutes: int = 60):
        self._store: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()
        self._ttl = timedelta(minutes=ttl_minutes)

    def save(self, processed: Dict[str, Any]) -> str:
        file_id = uuid.uuid4().hex[:16]
        with self._lock:
            self._cleanup()
            self._store[file_id] = {
                **processed,
                "_created": datetime.utcnow(),
            }
        return file_id

    def get(self, file_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            entry = self._store.get(file_id)
            if not entry:
                return None
            if datetime.utcnow() - entry["_created"] > self._ttl:
                del self._store[file_id]
                return None
            return {k: v for k, v in entry.items() if not k.startswith("_")}

    def _cleanup(self) -> None:
        now = datetime.utcnow()
        expired = [k for k, v in self._store.items() if now - v["_created"] > self._ttl]
        for k in expired:
            del self._store[k]


# Singleton
file_store = FileStore()
