# Kling Video Generator - Deployment Guide

## 📋 Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Infrastructure                          │
│                                                                  │
│  ┌───────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │  Azure Web App    │  │ Container       │  │ Blob Storage  │  │
│  │  (Linux,Node 20)  │◄─│ Registry (ACR)  │  │ saklingpro2025│  │
│  │  kling-video-     │  │ acrkling        │  │               │  │
│  │  generator        │  │                 │  │ ┌───────────┐ │  │
│  │                   │  │ klingai-studio  │  │ │temp-videos│ │  │
│  └───────────────────┘  │ :latest         │  │ └───────────┘ │  │
│                         └─────────────────┘  └───────────────┘  │
│                                                                  │
│  Resource Group: rg-kling-pro (Brazil South)                     │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗 Estrutura do Projeto

```
app/
├── src/                  # Frontend React 19 + TypeScript
├── server/               # Backend Express 4 + Node.js 20
│   ├── src/
│   │   ├── services/     # Instagram, Twitter, Queue, Engagement, etc.
│   │   ├── routes/       # API routes (video, image, auth, social)
│   │   ├── types/        # Tipos TypeScript
│   │   └── index.ts      # Entry point do servidor
│   └── dist/             # Backend compilado
├── dist/                 # Frontend compilado (Vite build)
├── Dockerfile            # Multi-stage build
├── .dockerignore         # Otimização do contexto Docker
└── web.config            # Configuração IIS/Azure (fallback)
```

---

## 🐳 Deploy via Container (Recomendado)

### Pré-requisitos
- Azure CLI instalado e logado (`az login`)
- Acesso ao Resource Group `rg-kling-pro`

### 1. Build da imagem (Azure Container Registry)

Não precisa de Docker local! O build é feito na nuvem:

```bash
cd app/

# Build + push para ACR em um comando
az acr build \
  --registry acrkling \
  --resource-group rg-kling-pro \
  --image klingai-studio:latest \
  --image klingai-studio:v1.1.0 \
  --file Dockerfile .
```

### 2. Configurar Web App para usar o container

```bash
# Habilitar admin no ACR (se ainda não estiver)
az acr update --name acrkling --admin-enabled true

# Obter credenciais do ACR
ACR_USER=$(az acr credential show --name acrkling --query username -o tsv)
ACR_PASS=$(az acr credential show --name acrkling --query "passwords[0].value" -o tsv)

# Configurar Web App para usar imagem do ACR
az webapp config container set \
  --name kling-video-generator \
  --resource-group rg-kling-pro \
  --container-image-name acrkling.azurecr.io/klingai-studio:latest \
  --container-registry-url https://acrkling.azurecr.io \
  --container-registry-user "$ACR_USER" \
  --container-registry-password "$ACR_PASS"

# Configurar porta do container
az webapp config appsettings set \
  --name kling-video-generator \
  --resource-group rg-kling-pro \
  --settings WEBSITES_PORT=8080
```

### 3. Verificar deploy

```bash
# Verificar status
az webapp show --name kling-video-generator --resource-group rg-kling-pro \
  --query "{state:state, hostName:defaultHostName}" -o table

# Health check
curl https://kling-video-generator.azurewebsites.net/api/health

# Logs em tempo real
az webapp log tail --name kling-video-generator --resource-group rg-kling-pro
```

### 4. Atualizar (novo deploy)

```bash
# Rebuildar e fazer push de nova versão
az acr build \
  --registry acrkling \
  --resource-group rg-kling-pro \
  --image klingai-studio:latest \
  --image klingai-studio:v1.2.0 \
  --file Dockerfile .

# Reiniciar Web App para puxar nova imagem
az webapp restart --name kling-video-generator --resource-group rg-kling-pro
```

---

## 📦 Deploy via ZIP (Alternativa)

### 1. Build completo
```bash
# Frontend
npm run build:frontend

# Backend
cd server && npm run build && cd ..
```

### 2. Criar pacote ZIP e Deploy
```bash
az webapp deploy \
  --name kling-video-generator \
  --resource-group rg-kling-pro \
  --src-path ./deployment.zip \
  --type zip
```

---

## 🔧 Variáveis de Ambiente

### Serviços Principais
| Variável | Descrição | Obrigatória |
|----------|-----------|:-----------:|
| `NODE_ENV` | Ambiente (production) | ✅ |
| `PORT` | Porta do servidor | ✅ |
| `KLING_ACCESS_KEY` | Chave de acesso Kling API | ✅ |
| `KLING_SECRET_KEY` | Chave secreta Kling API | ✅ |
| `GEMINI_API_KEY` | API Key Google Gemini | ❌ |
| `AZURE_DALLE_ENDPOINT` | Endpoint Azure DALL-E | ❌ |
| `AZURE_DALLE_KEY` | Chave Azure DALL-E | ❌ |
| `AZURE_DALLE_DEPLOYMENT` | Deployment DALL-E (dall-e-3) | ❌ |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob Storage connection | ✅ |

### Autenticação
| Variável | Descrição | Obrigatória |
|----------|-----------|:-----------:|
| `SESSION_SECRET` | Secret para JWT tokens | ✅ |
| `ADMIN_EMAIL` | Email do admin padrão | ✅ |
| `ADMIN_PASSWORD` | Senha do admin padrão | ✅ |

### Módulo Social Media
| Variável | Descrição | Obrigatória |
|----------|-----------|:-----------:|
| `META_APP_ID` | App ID do Meta Developer Dashboard | ⚠️* |
| `META_APP_SECRET` | App Secret da Meta | ⚠️* |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Token de verificação webhook IG | ⚠️* |
| `TWITTER_CLIENT_ID` | OAuth 2.0 Client ID do Twitter | ⚠️* |
| `TWITTER_CLIENT_SECRET` | OAuth 2.0 Client Secret do Twitter | ⚠️* |
| `SOCIAL_ENCRYPTION_KEY` | Chave AES-256 (64 hex chars) | ✅ |
| `SOCIAL_OAUTH_CALLBACK_BASE` | URL base para callbacks OAuth | ✅ |

> ⚠️* Obrigatórias apenas se o módulo social estiver habilitado para a respectiva plataforma.

### Configurar via CLI
```bash
az webapp config appsettings set \
  --name kling-video-generator \
  --resource-group rg-kling-pro \
  --settings \
    META_APP_ID="seu_app_id" \
    META_APP_SECRET="seu_app_secret" \
    TWITTER_CLIENT_ID="seu_client_id" \
    TWITTER_CLIENT_SECRET="seu_client_secret"
```

---

## 🌐 Endpoints da API

### Vídeo
- `POST /api/video/generate` — Iniciar geração de vídeo
- `GET /api/video/status/:id` — Obter status
- `GET /api/video/list` — Listar gerações
- `DELETE /api/video/:id` — Remover

### Imagem
- `POST /api/image/generate` — Gerar imagem
- `GET /api/image/` — Listar imagens
- `DELETE /api/image/:id` — Remover

### Autenticação
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Registrar
- `POST /api/auth/validate` — Validar token

### Social Media — OAuth
- `POST /api/social/oauth/instagram/init` — Iniciar OAuth Instagram
- `GET /api/social/oauth/instagram/callback` — Callback Instagram
- `POST /api/social/oauth/twitter/init` — Iniciar OAuth Twitter
- `GET /api/social/oauth/twitter/callback` — Callback Twitter
- `GET /api/social/connections` — Listar contas conectadas
- `DELETE /api/social/connections/:id` — Desconectar
- `POST /api/social/connections/:id/refresh` — Refresh token

### Social Media — Publicação
- `POST /api/social/publish` — Publicar mídia
- `POST /api/social/publish/multi` — Publicar em múltiplas redes
- `GET /api/social/publications` — Listar publicações
- `DELETE /api/social/publications/:id` — Cancelar
- `POST /api/social/publications/:id/retry` — Retentar

### Social Media — Engagement
- `GET /api/social/engagement/:publicationId` — Métricas atuais
- `GET /api/social/engagement/history/:publicationId` — Histórico
- `POST /api/social/engagement/refresh/:publicationId` — Forçar coleta

### Social Media — Dashboard
- `GET /api/social/dashboard/summary` — Resumo (cards)
- `GET /api/social/dashboard/chart` — Dados gráfico
- `GET /api/social/dashboard/top-posts` — Top posts
- `GET /api/social/dashboard/comparison` — Comparativo
- `GET /api/social/dashboard/queue-status` — Status fila
- `GET /api/social/dashboard/rate-limits` — Rate limits

### Webhooks
- `GET /api/social/webhooks/instagram` — Verificação Meta
- `POST /api/social/webhooks/instagram` — Eventos IG

### Sistema
- `GET /api/health` — Health check
- `GET /api/info` — Info da API

---

## 📱 Configuração de Redes Sociais

### Instagram (Meta Graph API v21)

1. Acesse https://developers.facebook.com
2. Crie ou selecione um App
3. Habilite o produto "Instagram Graph API"
4. Complete Business Verification
5. Conecte uma Facebook Page a uma Instagram Business Account
6. Configure o webhook:
   - URL: `https://kling-video-generator.azurewebsites.net/api/social/webhooks/instagram`
   - Verify Token: valor de `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
   - Assinaturas: `comments`, `mentions`
7. Copie `App ID` e `App Secret` para as env vars

### Twitter/X (API v2)

1. Acesse https://developer.twitter.com
2. Crie um Project + App
3. Habilite OAuth 2.0 com tipo "Web App"
4. Configure callback URL: `https://kling-video-generator.azurewebsites.net/api/social/oauth/twitter/callback`
5. Solicite Elevated Access (para media upload)
6. Copie `Client ID` e `Client Secret` para as env vars

---

## 📊 Recursos Azure

| Recurso | Nome | SKU | Região |
|---------|------|-----|--------|
| Resource Group | rg-kling-pro | — | Brazil South |
| Web App | kling-video-generator | Linux/Node 20 | Brazil South |
| Container Registry | acrkling | Basic | Brazil South |
| Storage Account | saklingpro2025 | Standard LRS | Brazil South |
| Blob Container | temp-videos | — | — |

---

## 🛠 Desenvolvimento Local

```bash
# Instalar dependências
npm install
cd server && npm install && cd ..

# Configurar .env
cp server/.env.example server/.env

# Rodar em dev
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```
