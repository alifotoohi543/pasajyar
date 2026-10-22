# ---------- 1) frontend ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2) dataset -> SQLite (FTS5) ----------
FROM python:3.12-slim AS data
WORKDIR /b
RUN pip install --no-cache-dir pandas==2.2.3
COPY backend/app/__init__.py backend/app/textnorm.py backend/app/
COPY scripts/build_db.py scripts/
COPY data/seed/ data/seed/
RUN python scripts/build_db.py data/seed /b/app.db

# ---------- 3) runtime ----------
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    APP_DB=/app/data/app.db \
    STATE_DB=/app/state/state.db \
    STATIC_DIR=/app/static
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && mkdir -p /app/state /app/data
COPY backend/app app
COPY --from=web /web/dist static
COPY --from=data /b/app.db data/app.db
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
