# Backend image for the LoyaltyForge FastAPI service (Phase 0 deploy).
# Portable across Render / Fly.io / Cloud Run. The NVIDIA key is provided at
# runtime via the host's env vars — never baked into the image.
FROM python:3.11-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

# Hosts inject $PORT; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

# Shell form so ${PORT} is expanded at runtime.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
