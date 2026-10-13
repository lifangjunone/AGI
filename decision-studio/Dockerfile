FROM node:22-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY src ./src
COPY vite.config.js ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY --from=web /build/dist ./dist
RUN useradd --create-home --uid 10001 appuser
USER appuser
EXPOSE 8810
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8810/api/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8810", "--proxy-headers"]
