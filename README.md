# Mistral Chatbot

A full-stack AI chatbot powered by **Mistral AI** with a modern, responsive UI — featuring real-time streaming responses, session management, file uploads, markdown rendering, and code highlighting.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?logo=fastapi)
![Mistral](https://img.shields.io/badge/Mistral_AI-Large-orange)

---

## Features

- **Real-time Streaming** — Token-by-token response via Server-Sent Events (SSE)
- **File Uploads (100 MB)** — Attach text files, code, images, and PDFs to your messages
- **Image Understanding** — Send images and Mistral's vision analyzes them
- **Session Management** — Server-side conversation history with JSON persistence
- **Markdown & Code Highlighting** — Powered by `marked.js` + `highlight.js` with one-click copy
- **Dark / Light Theme** — Toggle with localStorage persistence
- **Responsive Design** — Desktop & mobile friendly with slide-out sidebar
- **Typing Indicator** — Animated dots while the model generates
- **Starter Suggestions** — Quick-start prompt chips on the welcome screen
- **Error Handling** — Toast notifications with automatic rollback on API failure

---

## Project Structure

```
Mistral Chatbot/
├── .env.example              # Environment template (copy to .env)
├── .gitignore
├── Procfile                  # Railway deployment
├── railway.json              # Railway configuration
├── README.md
├── backend/
│   ├── app.py                # FastAPI server (REST + SSE + file upload)
│   ├── config.py             # Environment-based configuration
│   ├── file_handler.py       # File processing (text, image, PDF)
│   ├── models.py             # Pydantic request/response schemas
│   ├── session_manager.py    # In-memory + JSON-persisted sessions
│   ├── mistral_client.py     # Async Mistral SDK wrapper
│   └── requirements.txt      # Python dependencies
└── frontend/
    ├── vercel.json           # Vercel configuration
    ├── index.html            # Main UI
    ├── css/styles.css        # Dark/Light theme styles
    └── js/app.js             # Client-side application logic
```

---

## Getting Started (Local)

### Prerequisites

- Python 3.10+
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

Edit `.env` and add your Mistral API key:

```
MISTRAL_API_KEY=your_actual_api_key
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

## Deployment

### Backend → Railway

1. Go to [Railway](https://railway.app/) and create a new project
2. Connect your GitHub repo (`tehseen-h/mistral_chatbot`)
3. Railway auto-detects the `railway.json` config
4. Add these **environment variables** in Railway dashboard:

   | Variable         | Value                         |
   |------------------|-------------------------------|
   | `MISTRAL_API_KEY`| Your Mistral API key          |
   | `MISTRAL_MODEL`  | `mistral-large-latest`        |
   | `FRONTEND_URL`   | Your Vercel URL (after step below) |

5. Deploy — Railway will build and start the server automatically
6. Copy your Railway public URL (e.g. `https://your-app.up.railway.app`)

### Frontend → Vercel

1. Go to [Vercel](https://vercel.com/) and import the same GitHub repo
2. Set **Root Directory** to `frontend`
3. Set **Framework Preset** to `Other`
4. Deploy

5. **After deploying**, open `frontend/js/app.js` and update the `BACKEND_URL`:

   ```js
   const BACKEND_URL = "https://your-app.up.railway.app";
   ```

6. Commit & push — Vercel will auto-redeploy

7. Go back to Railway and set `FRONTEND_URL` to your Vercel URL  
   (e.g. `https://your-app.vercel.app`) for CORS to work

---

## API Endpoints

| Method   | Endpoint                     | Description                      |
|----------|------------------------------|----------------------------------|
| `POST`   | `/api/chat`                  | Send message (full reply)        |
| `POST`   | `/api/chat/stream`           | Send message (SSE stream)        |
| `POST`   | `/api/upload`                | Upload file (max 100 MB)         |
| `GET`    | `/api/sessions`              | List all sessions                |
| `GET`    | `/api/sessions/{id}`         | Get session detail               |
| `PATCH`  | `/api/sessions/{id}`         | Rename a session                 |
| `DELETE` | `/api/sessions/{id}`         | Delete a session                 |
| `GET`    | `/api/health`                | Health check                     |

---

## Supported File Types

| Category  | Extensions                                                        |
|-----------|-------------------------------------------------------------------|
| **Code**  | `.py`, `.js`, `.ts`, `.java`, `.cpp`, `.go`, `.rs`, `.rb`, etc.   |
| **Text**  | `.txt`, `.md`, `.csv`, `.json`, `.yaml`, `.xml`, `.log`, etc.     |
| **Images**| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`                  |
| **Docs**  | `.pdf`                                                            |

---

## Configuration

| Variable              | Default                 | Description                     |
|-----------------------|-------------------------|---------------------------------|
| `MISTRAL_API_KEY`     | *(required)*            | Your Mistral AI API key         |
| `MISTRAL_MODEL`       | `mistral-large-latest`  | Mistral model to use            |
| `HOST`                | `0.0.0.0`               | Server bind host                |
| `PORT`                | `8080`                  | Server port                     |
| `FRONTEND_URL`        | *(empty)*               | Vercel frontend URL (for CORS)  |

---

## License

This project is open source and available under the [MIT License](LICENSE).
