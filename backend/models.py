"""Pydantic models for request / response validation."""

from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Requests ────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10_000, description="User message")
    session_id: Optional[str] = Field(None, description="Existing session ID (omit to create new)")
    file_ids: Optional[List[str]] = Field(None, description="IDs of uploaded files to include")
    project_id: Optional[str] = Field(None, description="Project ID to scope session under")


class SessionRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, description="Project name")
    instructions: str = Field("", max_length=5_000, description="Custom system instructions for this project")


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    instructions: Optional[str] = Field(None, max_length=5_000)


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
    project_id: Optional[str] = None


class SessionListResponse(BaseModel):
    sessions: List[SessionInfo]


class FileUploadResponse(BaseModel):
    file_id: str
    filename: str
    category: str
    size: int


class SessionDetailResponse(BaseModel):
    session_id: str
    title: str
    messages: List[MessageOut]
    project_id: Optional[str] = None


# ── Projects ───────────────────────────────────────────────
class ProjectInfo(BaseModel):
    project_id: str
    name: str
    instructions: str
    created_at: str
    updated_at: str
    session_count: int


class ProjectDetailResponse(BaseModel):
    project_id: str
    name: str
    instructions: str
    created_at: str
    updated_at: str
    sessions: List[SessionInfo]


class ProjectListResponse(BaseModel):
    projects: List[ProjectInfo]
