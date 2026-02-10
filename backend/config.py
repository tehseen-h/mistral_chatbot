"""Application configuration — loads from .env and provides defaults."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)


class Settings:
    MISTRAL_API_KEY: str = os.getenv("MISTRAL_API_KEY", "")
    MISTRAL_MODEL: str = os.getenv("MISTRAL_MODEL", "mistral-large-latest")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8080"))

    # Deployment
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")  # e.g. https://your-app.vercel.app

    # Session defaults
    MAX_HISTORY_PER_SESSION: int = 50  # keep last N message pairs
    SESSION_TTL_HOURS: int = 24

    # File upload
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100 MB

    # Mistral generation defaults
    MAX_TOKENS: int = 4096
    TEMPERATURE: float = 0.7
    SYSTEM_PROMPT: str = (
        "You are a helpful, friendly, and knowledgeable AI assistant powered by Mistral. "
        "Provide clear, concise, and accurate answers. Use markdown formatting when appropriate. "
        "When sharing code, always wrap it in proper code blocks with the language specified."
    )

    @property
    def allowed_origins(self) -> list[str]:
        origins = ["http://localhost:8080", "http://localhost:3000", "http://127.0.0.1:8080"]
        if self.FRONTEND_URL:
            origins.append(self.FRONTEND_URL.rstrip("/"))
        return origins


settings = Settings()
