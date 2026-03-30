# ── Stage 1: Build frontend ──────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + static files ───────────
FROM python:3.12-slim
WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./

# Copy built frontend into backend/static
COPY --from=frontend-build /app/frontend/dist ./static

# Expose port
ENV PORT=8000
EXPOSE 8000

# Run
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
