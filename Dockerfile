# Dockerfile
FROM python:3.12-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Render provides PORT; bind 0.0.0.0:$PORT
ENV PORT=10000
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 2 --threads 4 app:app
