"""FastAPI application — serves the REST + SSE chat API and static frontend."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend package is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import json
import uvicorn
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from models import (
    ChatRequest,
    ChatResponse,
    FileUploadResponse,
    MessageOut,
    SessionDetailResponse,
    SessionInfo,
    SessionListResponse,
    SessionRenameRequest,
)
from session_manager import session_manager
from mistral_client import mistral_client
from file_handler import process_file, file_store, MAX_FILE_SIZE, get_file_category

# ── App setup ───────────────────────────────────────────────
app = FastAPI(title="Mistral Chatbot", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ── File upload endpoint ────────────────────────────────────


@app.post("/api/upload", response_model=FileUploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload a file (max 100 MB). Returns a file_id to reference in chat."""
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Max size is {MAX_FILE_SIZE // (1024*1024)} MB.")

    if not file.filename:
        raise HTTPException(400, "Filename is required.")

    try:
        processed = process_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(415, str(e))

    file_id = file_store.save(processed)

    return FileUploadResponse(
        file_id=file_id,
        filename=processed["filename"],
        category=processed["category"],
        size=processed["size"],
    )


def _build_user_message(text: str, file_ids: list[str] | None) -> dict:
    """Build a Mistral API user message, potentially multi-modal."""
    if not file_ids:
        return {"role": "user", "content": text}

    content_parts = []
    file_labels = []

    for fid in file_ids:
        fdata = file_store.get(fid)
        if not fdata:
            continue

        if fdata["category"] == "image":
            content_parts.append(
                {"type": "image_url", "image_url": {"url": fdata["data_url"]}}
            )
            file_labels.append(f"[Image: {fdata['filename']}]")
        elif fdata["category"] == "text":
            # Inject text file content as context
            file_text = fdata["text_content"]
            if len(file_text) > 50_000:
                file_text = file_text[:50_000] + "\n... (truncated)"
            content_parts.append(
                {"type": "text", "text": f"Content of {fdata['filename']}:\n```\n{file_text}\n```"}
            )
            file_labels.append(f"[File: {fdata['filename']}]")

    # Add the user's own message
    if text:
        content_parts.append({"type": "text", "text": text})

    # If only text parts (no images), flatten to a single string for efficiency
    has_images = any(p.get("type") == "image_url" for p in content_parts)
    if not has_images:
        combined = "\n\n".join(p["text"] for p in content_parts if p.get("type") == "text")
        return {"role": "user", "content": combined}

    return {"role": "user", "content": content_parts}


def _session_display_text(text: str, file_ids: list[str] | None) -> str:
    """Build the text stored in session history (no base64 blobs)."""
    parts = []
    if file_ids:
        for fid in file_ids:
            fdata = file_store.get(fid)
            if not fdata:
                continue
            if fdata["category"] == "image":
                parts.append(f"\U0001f4ce Image: {fdata['filename']}")
            else:
                parts.append(f"\U0001f4ce File: {fdata['filename']}")
    if text:
        parts.append(text)
    return "\n".join(parts) or text


# ── Chat endpoints ─────────────────────────────────────────


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Send a message and get a complete response."""
    session = session_manager.get_or_create(req.session_id)

    # Auto-title on first message
    if not session.messages:
        session.auto_title(req.message)

    # Build display text & API message
    display = _session_display_text(req.message, req.file_ids)
    session.add_message("user", display)

    # Build the API messages (with multimodal content if files)
    api_msgs = session.get_api_messages()
    # Replace the last user message with the full file-aware version
    api_msgs[-1] = _build_user_message(req.message, req.file_ids)

    # Call Mistral
    try:
        reply = await mistral_client.chat(api_msgs)
    except Exception as e:
        session.messages.pop()
        raise HTTPException(status_code=502, detail=f"Mistral API error: {str(e)}")

    assistant_msg = session.add_message("assistant", reply)
    session_manager.save()

    return ChatResponse(
        session_id=session.session_id,
        message=MessageOut(**assistant_msg.to_dict()),
    )


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    """Send a message and receive the response as Server-Sent Events."""
    session = session_manager.get_or_create(req.session_id)

    if not session.messages:
        session.auto_title(req.message)

    display = _session_display_text(req.message, req.file_ids)
    session.add_message("user", display)

    api_messages = session.get_api_messages()
    api_messages[-1] = _build_user_message(req.message, req.file_ids)

    async def event_generator():
        full_reply = []
        try:
            # Send session_id first so the frontend knows which session this belongs to
            yield f"data: {json.dumps({'type': 'session', 'session_id': session.session_id})}\n\n"

            async for chunk in mistral_client.chat_stream(api_messages):
                full_reply.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

            # Save full reply
            complete = "".join(full_reply)
            assistant_msg = session.add_message("assistant", complete)
            session_manager.save()

            yield f"data: {json.dumps({'type': 'done', 'message': assistant_msg.to_dict()})}\n\n"
        except Exception as e:
            session.messages.pop()  # Remove the user msg on failure
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── Session endpoints ──────────────────────────────────────


@app.get("/api/sessions", response_model=SessionListResponse)
async def list_sessions():
    return SessionListResponse(
        sessions=[SessionInfo(**s) for s in session_manager.list_sessions()]
    )


@app.get("/api/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    detail = session.to_detail()
    return SessionDetailResponse(
        session_id=detail["session_id"],
        title=detail["title"],
        messages=[MessageOut(**m) for m in detail["messages"]],
    )


@app.patch("/api/sessions/{session_id}")
async def rename_session(session_id: str, req: SessionRenameRequest):
    ok = session_manager.rename_session(session_id, req.title)
    if not ok:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    ok = session_manager.delete_session(session_id)
    if not ok:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


# ── Health ──────────────────────────────────────────────────


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": settings.MISTRAL_MODEL}


# ── Serve frontend statics ─────────────────────────────────
_frontend = Path(__file__).resolve().parent.parent / "frontend"
if _frontend.exists():
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="frontend")


# ── Entrypoint ──────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
