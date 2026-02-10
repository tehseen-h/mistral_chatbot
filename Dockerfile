FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Railway injects PORT env var
ENV PORT=8080
EXPOSE ${PORT}

CMD python -m uvicorn app:app --host 0.0.0.0 --port ${PORT}
