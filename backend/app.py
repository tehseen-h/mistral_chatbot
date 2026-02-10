"""FastAPI application — serves the REST + SSE chat API and static frontend."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend package is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import json
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from models import (
    ChatRequest,
    ChatResponse,
    MessageOut,
    SessionDetailResponse,
    SessionInfo,
    SessionListResponse,
    SessionRenameRequest,
)
from session_manager import session_manager
from mistral_client import mistral_client

# ── App setup ───────────────────────────────────────────────
app = FastAPI(title="Mistral Chatbot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Chat endpoints ─────────────────────────────────────────


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Send a message and get a complete response."""
    session = session_manager.get_or_create(req.session_id)

    # Auto-title on first message
    if not session.messages:
        session.auto_title(req.message)

    # Record user message
    session.add_message("user", req.message)

    # Call Mistral
    try:
        reply = await mistral_client.chat(session.get_api_messages())
    except Exception as e:
        # Roll back the user message on failure
        session.messages.pop()
        raise HTTPException(status_code=502, detail=f"Mistral API error: {str(e)}")

    # Record assistant message
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

    session.add_message("user", req.message)
    api_messages = session.get_api_messages()

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
