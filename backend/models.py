"""Pydantic models for request / response validation."""

from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Requests ────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10_000, description="User message")
    session_id: Optional[str] = Field(None, description="Existing session ID (omit to create new)")


class SessionRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


# ── Responses ───────────────────────────────────────────────
class MessageOut(BaseModel):
    role: str
    content: str
    timestamp: str


class ChatResponse(BaseModel):
    session_id: str
    message: MessageOut


class SessionInfo(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int


class SessionListResponse(BaseModel):
    sessions: List[SessionInfo]


class SessionDetailResponse(BaseModel):
    session_id: str
    title: str
    messages: List[MessageOut]
