# ============================================================================
# KlingAI Studio — Dockerfile Multi-Stage
# ============================================================================
# Estágio 1: Build do Frontend (Vite + React)
# Estágio 2: Build do Backend (TypeScript → JavaScript)
# Estágio 3: Imagem de produção otimizada (Node 20 Alpine)
# ============================================================================

# ── Estágio 1: Build do Frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copiar package files do frontend
COPY package.json package-lock.json* ./

# Instalar dependências do frontend
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Copiar código-fonte do frontend
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY tailwind.config.js postcss.config.js components.json ./
COPY src/ ./src/

# Build do frontend
RUN npx vite build

# ── Estágio 2: Build do Backend ─────────────────────────────────────────────
FROM node:20-alpine AS backend-build

WORKDIR /app/server

# Copiar package files do backend
COPY server/package.json server/package-lock.json* ./

# Instalar dependências do backend (incluindo devDependencies para tsc)
RUN npm ci 2>/dev/null || npm install

# Copiar código-fonte do backend
COPY server/tsconfig.json ./
COPY server/src/ ./src/

# Compilar TypeScript
RUN npx tsc

# ── Estágio 3: Imagem de Produção ──────────────────────────────────────────
FROM node:20-alpine AS production

# Labels
LABEL maintainer="KlingAI Studio"
LABEL description="KlingAI Studio - Geração de Vídeos e Imagens com IA + Integração Social Media"
LABEL version="1.0.0"

# Definir variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Instalar apenas dependências de produção do backend
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && (npm ci --omit=dev 2>/dev/null || npm install --omit=dev)

# Copiar backend compilado
COPY --from=backend-build /app/server/dist/ ./server/dist/

# Copiar frontend compilado
COPY --from=frontend-build /app/dist/ ./dist/

# Copiar web.config (para Azure, se necessário)
COPY web.config ./

# Criar diretórios de dados (serão volumes em produção)
RUN mkdir -p /app/data /app/temp_uploads /app/logs

# Permissões corretas
RUN chown -R node:node /app

# Usar usuário não-root
USER node

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Expor porta
EXPOSE ${PORT}

# Startup
CMD ["node", "server/dist/index.js"]
