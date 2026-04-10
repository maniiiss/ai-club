FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml ./
COPY maven-settings-central.xml ./
RUN mvn -q -s maven-settings-central.xml -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -s maven-settings-central.xml -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app

ENV TZ=Asia/Shanghai
COPY --from=build /workspace/target/ai-agent-platform-backend-0.1.0-SNAPSHOT.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
