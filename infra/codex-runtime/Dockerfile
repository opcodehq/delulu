FROM node:24.14.1-bookworm-slim
WORKDIR /opt/delulu-codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY src ./src
ENV PATH="/opt/delulu-codex/node_modules/.bin:${PATH}" CODEX_RUNTIME_DATA=/data PORT=8788
USER node
VOLUME ["/data"]
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8788/health').then(r=>{if(!r.ok)process.exit(1)})"
CMD ["node", "src/server.mjs"]
