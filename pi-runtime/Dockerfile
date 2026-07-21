FROM node:20-bookworm-slim AS agent-core-package

WORKDIR /build
COPY packages/gitpilot-agent-core ./packages/gitpilot-agent-core
RUN mkdir -p /out && npm pack --pack-destination /out ./packages/gitpilot-agent-core

FROM node:20-bookworm-slim

WORKDIR /app
COPY pi-runtime/package.json ./
COPY pi-runtime/package-lock.json* ./
COPY --from=agent-core-package /out/*.tgz /tmp/
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); const core=fs.readdirSync('/tmp').find((name)=>name.startsWith('aiclub-gitpilot-agent-core-')&&name.endsWith('.tgz')); p.dependencies['@aiclub/gitpilot-agent-core']='file:/tmp/'+core; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')" \
    && npm install --omit=dev --package-lock=false \
    && rm -f /tmp/*.tgz
COPY pi-runtime/src ./src

EXPOSE 9010
CMD ["node", "src/server.mjs"]
