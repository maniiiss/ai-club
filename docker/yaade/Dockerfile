FROM alpine/git:2.47.2 AS source

ARG YAADE_REF=main

WORKDIR /workspace

RUN git clone --depth 1 --branch "${YAADE_REF}" https://github.com/EsperoTech/yaade.git yaade


FROM node:20-bullseye AS client-builder

WORKDIR /workspace/yaade

COPY --from=source /workspace/yaade /workspace/yaade
COPY docker/yaade/scripts/apply-zh-cn.mjs /opt/aiclub-yaade/apply-zh-cn.mjs
COPY docker/yaade/scripts/apply-aiclub-branding.mjs /opt/aiclub-yaade/apply-aiclub-branding.mjs

# 在 client 构建前注入中文文案补丁，保持服务端逻辑不变，只替换前端高频界面文案。
RUN node /opt/aiclub-yaade/apply-zh-cn.mjs /workspace/yaade
# 在中文化之后单独注入 AI Club 品牌与主题补丁，避免品牌适配和翻译补丁耦合。
RUN node /opt/aiclub-yaade/apply-aiclub-branding.mjs /workspace/yaade

WORKDIR /workspace/yaade/client

RUN npm install
RUN npm run build


FROM gradle:8.10.2-jdk17 AS server-builder

WORKDIR /workspace/yaade

COPY --from=source /workspace/yaade /workspace/yaade
COPY --from=client-builder /workspace/yaade/client/dist /workspace/yaade/server/src/main/resources/webroot

WORKDIR /workspace/yaade/server

RUN chmod +x gradlew
RUN gradle clean build --no-daemon


FROM amazoncorretto:17

WORKDIR /app

EXPOSE 9339

COPY --from=server-builder /workspace/yaade/server/build/libs/dependencies/*.jar /app/libs/
COPY --from=server-builder /workspace/yaade/server/build/resources/main /app/resources
COPY --from=server-builder /workspace/yaade/server/build/classes/kotlin/main /app/classes
COPY --from=server-builder /workspace/yaade/server/build/classes/java/main /app/classes
COPY --from=server-builder /workspace/yaade/server/build/libs/*.jar /app/libs/

ENV CLASSPATH=/app/classes:/app/resources:/app/libs/*
ENV YAADE_HEAP_SIZE=""
# Yaade 上游默认把 H2 与文件存储写到 ./app/data/*，在我们的镜像工作目录 /app 下会解析成 /app/app/data。
# 这里显式改到 /app/data，确保 docker-compose.yaade.yml 挂载的宿主机目录能真正持久化数据库和附件。
ENV YAADE_JDBC_URL=jdbc:h2:file:/app/data/yaade-db
ENV YAADE_FILE_STORAGE_PATH=/app/data/files

ENTRYPOINT ["sh", "-c", "if [ -z \"$YAADE_HEAP_SIZE\" ]; then java com.espero.yaade.MainKt; else java -Xmx${YAADE_HEAP_SIZE} com.espero.yaade.MainKt; fi"]
