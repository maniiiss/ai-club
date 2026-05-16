ARG GITNEXUS_WEB_BASE_IMAGE=ghcr.io/abhigyanpatwari/gitnexus-web:latest

FROM ${GITNEXUS_WEB_BASE_IMAGE}

USER root

COPY inject-zh-runtime.mjs /tmp/inject-zh-runtime.mjs
COPY gitnexus-zh-runtime.js /tmp/gitnexus-zh-runtime.js
COPY --chown=node:node docker-server.mjs /app/docker-server.mjs
COPY --chown=node:node write-gitnexus-runtime-config.mjs /app/write-gitnexus-runtime-config.mjs
COPY gitnexus-entrypoint.sh /usr/local/bin/gitnexus-entrypoint.sh

RUN node /tmp/inject-zh-runtime.mjs \
    && rm -f /tmp/inject-zh-runtime.mjs /tmp/gitnexus-zh-runtime.js \
    && chmod +x /usr/local/bin/gitnexus-entrypoint.sh \
    && chown -R node:node /app/dist

USER node

ENTRYPOINT ["gitnexus-entrypoint.sh"]
CMD ["node", "docker-server.mjs"]
