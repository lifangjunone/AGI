FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

ENV DECISION_LAB_HOST=0.0.0.0
EXPOSE 8800
CMD ["decision-lab"]
