# One image = one book (see deploy/README.md for the one-instance-per-book
# model). Build from the REPO ROOT so the book source and pipeline are in
# context:
#
#   docker build -f deploy/Dockerfile -t textbook-<slug> .
#
# The book itself is built during `docker build` (~5-10 min): the image that
# comes out is fully self-contained — pipeline output, frontend bundle, and
# backend — and needs only /data (SQLite) and env secrets at runtime.
# After editing the .tex or book.toml, rebuild the image and restart.
#
# WITH_TEX=1 additionally installs the TeX fallback toolchain (~2 GB) that
# LaTeXML uses to rasterize tikz pictures / tcolorbox etc. Books that use
# such packages need it; plain amsmath books don't.
#   docker build -f deploy/Dockerfile --build-arg WITH_TEX=1 ...

FROM debian:bookworm-slim
ARG WITH_TEX=0

# Debian 12 ships exactly LaTeXML 0.8.7, the version the pipeline is
# verified against (pipeline/build.sh refuses to run any other).
RUN apt-get update && DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --no-install-recommends \
        latexml \
        python3 python3-venv python3-pip \
        nodejs npm \
        ca-certificates \
    && if [ "$WITH_TEX" = "1" ]; then \
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
            texlive-latex-recommended texlive-latex-extra texlive-science \
            texlive-pictures texlive-fonts-recommended texlive-plain-generic \
            ghostscript dvisvgm imagemagick pdf2svg; \
    fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend deps first (cache-friendly: survives book edits).
COPY backend/requirements.txt backend/requirements.txt
RUN python3 -m venv backend/.venv \
    && backend/.venv/bin/pip install --no-cache-dir -r backend/requirements.txt

# Frontend deps next (also cache-friendly).
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund

# The repo (book source, pipeline, code). .dockerignore keeps out secrets,
# venvs, and stale build artifacts.
COPY . .

# Build the book (.tex -> manifest + chapter HTML) and the reader bundle.
RUN bash pipeline/build.sh
RUN cd frontend && npm run build

# Runtime posture: bind all interfaces inside the container (the compose
# file only publishes to localhost; nginx terminates TLS in front), Secure
# cookies on, SQLite on the /data volume.
ENV TEXTBOOK_HOST=0.0.0.0 \
    TEXTBOOK_PORT=8000 \
    TEXTBOOK_DB=/data/textbook.db \
    TEXTBOOK_COOKIE_SECURE=1
VOLUME /data
EXPOSE 8000

CMD ["backend/.venv/bin/python", "backend/app.py"]
