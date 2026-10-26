# syntax=docker/dockerfile:1

FROM ghcr.io/pnpm/pnpm:12.14.0@sha256:71202ae73719148f6b6e129ca1e9fa3ceabbc9a037dc34800715606f2b5290a1 AS pnpm

FROM node:22-trixie-slim@sha256:8eb619e402eaede1748a3c8173bffab391592812e85136452f781741c7242ddf AS frontend-build
COPY --from=pnpm /opt/pnpm /opt/pnpm
ENV PATH="/opt/pnpm:${PATH}"
WORKDIR /build/frontend
RUN test "$(pnpm --version)" = "12.14.0"
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=sureau-pnpm-12,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY frontend/index.html frontend/tsconfig*.json frontend/vite.config.ts ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN pnpm run build

FROM eclipse-temurin:24-jdk-noble@sha256:dacac8e9a0df0d2bd24e702b4431132875c249930b70555ebd7ca285b5bee684 AS backend-build
WORKDIR /build/backend
COPY backend/pom.xml backend/mvnw ./
COPY backend/.mvn ./.mvn
COPY backend/src/main ./src/main
COPY --from=frontend-build /build/frontend/dist ./src/main/resources/static
RUN --mount=type=cache,id=sureau-maven,target=/root/.m2 \
    sed -i 's/\r$//' mvnw && \
    sh ./mvnw --batch-mode --no-transfer-progress -Dmaven.test.skip=true clean package

FROM eclipse-temurin:24-jre-noble@sha256:b416d02335e702b0403ff280de9475a3348e29382285969c9d4e17862ce632e7 AS runtime
RUN useradd --uid 10001 --user-group --no-create-home --home-dir /app --shell /usr/sbin/nologin sureau && \
    command -v curl
WORKDIR /app
COPY --from=backend-build --chmod=0444 /build/backend/target/*.jar /app/sureau.jar
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl --fail --silent --show-error --max-time 4 "http://127.0.0.1:${SERVER_PORT:-8080}/actuator/health/readiness" || exit 1
CMD ["java", "-jar", "/app/sureau.jar"]
