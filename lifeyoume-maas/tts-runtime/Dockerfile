FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install \
    --index-url http://mirrors.tencentyun.com/pypi/simple \
    --trusted-host mirrors.tencentyun.com \
    --timeout 120 \
    --retries 5 \
    --no-cache-dir \
    -r requirements.txt
COPY server.py ./
RUN useradd --system --uid 10001 --create-home runtime
USER runtime
ENV TTS_HOST=0.0.0.0 TTS_PORT=43281 TTS_MODEL_DIR=/models
EXPOSE 43281
CMD ["python", "server.py"]
