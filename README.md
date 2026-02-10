# Mistral Chatbot 🤖

A full-stack AI chatbot powered by **Mistral AI** with a modern, responsive UI — featuring real-time streaming responses, session management, markdown rendering, and code highlighting.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?logo=fastapi)
![Mistral](https://img.shields.io/badge/Mistral_AI-Large-orange)

---

## ✨ Features

- **Real-time Streaming** — Token-by-token response via Server-Sent Events (SSE)
- **Session Management** — Server-side conversation history with JSON persistence
- **Markdown & Code Highlighting** — Powered by `marked.js` + `highlight.js` with one-click copy
- **Dark / Light Theme** — Toggle with localStorage persistence
- **Responsive Design** — Desktop & mobile friendly with slide-out sidebar
- **Typing Indicator** — Animated dots while the model generates
- **Starter Suggestions** — Quick-start prompt chips on the welcome screen
- **Error Handling** — Toast notifications with automatic rollback on API failure

---

## 📁 Project Structure

```
Mistral Chatbot/
├── .env.example              # Environment template (copy to .env)
├── .gitignore
├── README.md
├── backend/
│   ├── app.py                # FastAPI server (REST + SSE)
│   ├── config.py             # Environment-based configuration
│   ├── models.py             # Pydantic request/response schemas
│   ├── session_manager.py    # In-memory + JSON-persisted sessions
│   ├── mistral_client.py     # Async Mistral SDK wrapper
│   └── requirements.txt      # Python dependencies
└── frontend/
    ├── index.html            # Main UI
    ├── css/styles.css        # Dark/Light theme styles
    └── js/app.js             # Client-side application logic
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10 or higher
- A [Mistral AI](https://console.mistral.ai/) API key

### 1. Clone the repository

```bash
git clone https://github.com/tehseen-h/mistral_chatbot.git
cd mistral_chatbot
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and add your Mistral API key:

```
MISTRAL_API_KEY=your_actual_api_key
MISTRAL_MODEL=mistral-large-latest
PORT=8080
```

### 3. Install dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Run the server

```bash
cd backend
python app.py
```

### 5. Open in browser

Navigate to **http://localhost:8080** and start chatting!

---

## 🛠 API Endpoints

| Method   | Endpoint                     | Description                |
|----------|------------------------------|----------------------------|
| `POST`   | `/api/chat`                  | Send message (full reply)  |
| `POST`   | `/api/chat/stream`           | Send message (SSE stream)  |
| `GET`    | `/api/sessions`              | List all sessions          |
| `GET`    | `/api/sessions/{id}`         | Get session detail         |
| `PATCH`  | `/api/sessions/{id}`         | Rename a session           |
| `DELETE` | `/api/sessions/{id}`         | Delete a session           |
| `GET`    | `/api/health`                | Health check               |

---

## 🔧 Configuration

All settings are managed via environment variables (`.env`):

| Variable              | Default                 | Description                     |
|-----------------------|-------------------------|---------------------------------|
| `MISTRAL_API_KEY`     | *(required)*            | Your Mistral AI API key         |
| `MISTRAL_MODEL`       | `mistral-large-latest`  | Mistral model to use            |
| `HOST`                | `0.0.0.0`               | Server bind host                |
| `PORT`                | `8080`                  | Server port                     |

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).
