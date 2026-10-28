FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LIBRARY_PATH=/srv/demo-library \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /srv

COPY app/requirements.txt app/requirements.txt
RUN pip install --no-cache-dir -r app/requirements.txt

COPY app app
COPY demo-library demo-library

RUN useradd --uid 1000 --home-dir /home/library --create-home library \
    && mkdir -p /data \
    && chown library:library /data

USER library

EXPOSE 8080
VOLUME ["/data"]

CMD ["python", "-m", "app.main"]
