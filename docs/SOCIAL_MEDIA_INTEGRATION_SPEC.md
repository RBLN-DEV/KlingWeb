# 📱 Módulo de Integração com Redes Sociais — Escopo Técnico

## Especificação de Arquitetura de Software
**Plataforma**: KlingAI Studio  
**Versão do Documento**: 1.0  
**Data**: Fevereiro 2026  
**Stack Base**: React 19 + Vite 7 (Frontend) | Express 4 + Node.js 20 (Backend) | Azure Web App (Infra)

---

## 📋 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Autenticação e Permissões (OAuth 2.0)](#2-autenticação-e-permissões-oauth-20)
3. [Publicação Automatizada](#3-publicação-automatizada)
4. [Monitoramento de Engajamento](#4-monitoramento-de-engajamento)
5. [Resiliência e Escalabilidade](#5-resiliência-e-escalabilidade)
6. [Modelo de Dados e Dashboard de Engajamento](#6-modelo-de-dados-e-dashboard-de-engajamento)
7. [Estrutura de Arquivos do Módulo](#7-estrutura-de-arquivos-do-módulo)
8. [Variáveis de Ambiente](#8-variáveis-de-ambiente)
9. [Dependências Necessárias](#9-dependências-necessárias)
10. [Plano de Implementação por Fases](#10-plano-de-implementação-por-fases)

---

## 1. Visão Geral da Arquitetura

### 1.1 Posicionamento no Sistema Existente

O módulo de redes sociais se integra como uma **camada horizontal** sobre a plataforma atual, consumindo as mídias já geradas (imagens via Gemini/DALL-E e vídeos via Kling) e oferecendo publicação direta e monitoramento.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + Vite)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Dashboard │  │ Galerias │  │  Social Hub  │  │ Social Metrics │  │
│  │ (atual)   │  │ (atual)  │  │  (NOVO)      │  │ Dashboard(NOVO)│  │
│  └──────────┘  └──────────┘  └──────────────┘  └────────────────┘  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ REST API
┌───────────────────────────┴─────────────────────────────────────────┐
│                     BACKEND (Express 4 + Node 20)                    │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐   │
│  │ Auth Routes      │  │ Social Routes   │  │ Webhook Routes     │   │
│  │ (existente)      │  │ (NOVO)          │  │ (NOVO)             │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬───────────┘   │
│           │                    │                      │              │
│  ┌────────┴────────────────────┴──────────────────────┴───────────┐  │
│  │                    SERVICE LAYER                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │  │
│  │  │ instagram    │  │ twitter      │  │ social-queue          │ │  │
│  │  │ .service.ts  │  │ .service.ts  │  │ .service.ts           │ │  │
│  │  └──────────────┘  └──────────────┘  └───────────────────────┘ │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │  │
│  │  │ oauth        │  │ engagement   │  │ rate-limiter          │ │  │
│  │  │ .service.ts  │  │ .service.ts  │  │ .service.ts           │ │  │
│  │  └──────────────┘  └──────────────┘  └───────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    DATA LAYER                                 │    │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │    │
│  │  │ social-tokens  │  │ publications   │  │ engagement     │  │    │
│  │  │ .json          │  │ .json          │  │ -metrics.json  │  │    │
│  │  └────────────────┘  └────────────────┘  └────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌──────────────────┐       ┌──────────────────┐
    │  Instagram API   │       │  Twitter/X API   │
    │  (Graph API v21) │       │  (API v2)        │
    └──────────────────┘       └──────────────────┘
```

### 1.2 Princípios de Design

| Princípio | Aplicação |
|-----------|-----------|
| **Consistência** | Mesma stack (Express + JSON storage) do sistema existente (`user.store.ts`) |
| **Extensibilidade** | Interface `SocialProvider` permite adicionar TikTok, YouTube etc. no futuro |
| **Fail-safe** | Fila de publicações com retry automático; nenhuma perda de conteúdo |
| **Privacidade** | Tokens OAuth criptografados em repouso; refresh automático sem intervenção |

---

## 2. Autenticação e Permissões (OAuth 2.0)

### 2.1 Fluxo Instagram (Meta Graph API)

O Instagram Business/Creator exige autenticação via **Facebook Login** com permissões de escopo específicas.

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌───────────┐
│  Usuário  │────▶│ Frontend │────▶│  /api/social/ │────▶│ Meta OAuth│
│  (clica   │     │ redireciona    │  oauth/       │     │ Server    │
│  conectar)│     │ para Meta │     │  instagram/   │     │           │
│           │◀────│           │◀────│  callback     │◀────│           │
└──────────┘     └──────────┘     └──────────────┘     └───────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ Armazena      │
                                  │ access_token  │
                                  │ + ig_user_id  │
                                  │ (criptografado│
                                  │  em JSON)     │
                                  └──────────────┘
```

**Escopos necessários (Instagram Graph API v21):**
```
instagram_basic
instagram_content_publish
instagram_manage_comments
instagram_manage_insights
pages_show_list
pages_read_engagement
```

**Endpoints Meta envolvidos:**
- Authorization: `https://www.facebook.com/v21.0/dialog/oauth`
- Token Exchange: `https://graph.facebook.com/v21.0/oauth/access_token`
- Long-Lived Token: `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token`
- Token Refresh: Long-lived tokens duram 60 dias; refresh automático a cada 50 dias

### 2.2 Fluxo Twitter/X (OAuth 2.0 PKCE)

O Twitter/X API v2 usa **OAuth 2.0 com PKCE** (sem client_secret no frontend).

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌───────────┐
│  Usuário  │────▶│ Frontend │────▶│  /api/social/ │────▶│ Twitter   │
│  (clica   │     │ redireciona    │  oauth/       │     │ OAuth 2.0 │
│  conectar)│     │ para X    │     │  twitter/     │     │ Server    │
│           │◀────│           │◀────│  callback     │◀────│           │
└──────────┘     └──────────┘     └──────────────┘     └───────────┘
```

**Escopos necessários (Twitter API v2):**
```
tweet.read
tweet.write
users.read
offline.access       # Para refresh_token
media.upload         # Upload de mídia
```

**Endpoints Twitter envolvidos:**
- Authorization: `https://twitter.com/i/oauth2/authorize`
- Token Exchange: `https://api.twitter.com/2/oauth2/token`
- Refresh: O `refresh_token` não expira enquanto não for usado ou revogado

### 2.3 Modelo de Dados — Tokens OAuth

```typescript
// server/src/types/social.types.ts

export interface SocialToken {
    id: string;                           // UUID
    userId: string;                       // Referência ao StoredUser.id
    provider: 'instagram' | 'twitter';
    providerUserId: string;               // ID do usuário na rede social
    providerUsername: string;              // @username
    profilePictureUrl?: string;
    accessToken: string;                  // Criptografado com AES-256-GCM
    refreshToken?: string;                // Criptografado (Twitter)
    tokenExpiresAt: string;               // ISO 8601
    scopes: string[];                     // Permissões concedidas
    isActive: boolean;
    connectedAt: string;                  // ISO 8601
    lastRefreshedAt: string;              // ISO 8601
    lastUsedAt?: string;
    metadata: {
        // Instagram-specific
        instagramBusinessAccountId?: string;
        facebookPageId?: string;
        // Twitter-specific
        twitterCodeVerifier?: string;     // PKCE (temporário, durante auth flow)
    };
}
```

### 2.4 Criptografia de Tokens

```typescript
// server/src/services/crypto.service.ts

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.SOCIAL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
// Em produção: SOCIAL_ENCRYPTION_KEY DEVE ser uma env var fixa de 64 chars hex

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    // Formato: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, ciphertext] = encryptedText.split(':');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

### 2.5 Serviço de OAuth

```typescript
// server/src/services/oauth.service.ts — Interface e fluxo

export interface OAuthService {
    getAuthorizationUrl(userId: string, state: string): string;
    handleCallback(code: string, state: string, codeVerifier?: string): Promise<SocialToken>;
    refreshToken(token: SocialToken): Promise<SocialToken>;
    revokeToken(token: SocialToken): Promise<void>;
    validateToken(token: SocialToken): Promise<boolean>;
}
```

### 2.6 Rotas de OAuth

```
POST   /api/social/oauth/instagram/init      → Gera URL de autorização Meta
GET    /api/social/oauth/instagram/callback   → Recebe code, troca por token, armazena
POST   /api/social/oauth/twitter/init         → Gera URL de autorização Twitter + PKCE
GET    /api/social/oauth/twitter/callback      → Recebe code, troca por token
GET    /api/social/connections                 → Lista contas conectadas do usuário
DELETE /api/social/connections/:id             → Desconecta uma conta
POST   /api/social/connections/:id/refresh     → Força refresh do token
```

---

## 3. Publicação Automatizada

### 3.1 Requisitos de Mídia por Plataforma

| Requisito | Instagram | Twitter/X |
|-----------|-----------|-----------|
| **Imagem — Formatos** | JPEG, PNG | JPEG, PNG, GIF, WEBP |
| **Imagem — Tamanho máximo** | 8 MB | 5 MB |
| **Imagem — Aspect Ratio** | 4:5 a 1.91:1 (feed), 9:16 (stories) | Sem restrição |
| **Imagem — Resolução** | Máx 1440×1440 | Máx 4096×4096 |
| **Vídeo — Formatos** | MP4 (H.264, AAC) | MP4 |
| **Vídeo — Tamanho máximo** | 100 MB (feed), 250 MB (reels) | 512 MB |
| **Vídeo — Duração** | 3–60s (feed), 3–90s (reels) | 0.5–140s |
| **Vídeo — Aspect Ratio** | 1:1, 4:5, 9:16 | 1:1, 16:9, 9:16 |
| **Vídeo — Resolução mín** | 600×600 | 32×32 |
| **Caption máx** | 2.200 caracteres | 280 caracteres (texto do tweet) |

### 3.2 Fluxo de Publicação no Instagram

A publicação no Instagram é **assíncrona em 2 etapas**:

```
Etapa 1: Criar Container de Mídia
POST https://graph.facebook.com/v21.0/{ig-user-id}/media
  Body (Imagem): { image_url, caption }
  Body (Vídeo/Reel): { video_url, caption, media_type: "REELS" }
  → Retorna: { id: "container_id" }

Etapa 2: Verificar Status (polling)
GET https://graph.facebook.com/v21.0/{container_id}?fields=status_code
  → Esperar até status_code === "FINISHED"

Etapa 3: Publicar
POST https://graph.facebook.com/v21.0/{ig-user-id}/media_publish
  Body: { creation_id: container_id }
  → Retorna: { id: "ig_media_id" }
```

### 3.3 Fluxo de Publicação no Twitter/X

```
Etapa 1: Upload de Mídia (chunked para vídeos)
POST https://upload.twitter.com/1.1/media/upload.json
  — INIT:   command=INIT, total_bytes, media_type
  — APPEND: command=APPEND, media_id, segment_index, media_data (chunks)
  — FINALIZE: command=FINALIZE, media_id
  — STATUS:  command=STATUS, media_id (polling até processing_info.state === "succeeded")

Etapa 2: Criar Tweet com Mídia
POST https://api.twitter.com/2/tweets
  Body: { text: caption, media: { media_ids: ["media_id"] } }
  → Retorna: { data: { id: "tweet_id" } }
```

### 3.4 Modelo de Dados — Publicações

```typescript
// server/src/types/social.types.ts

export type PublicationStatus =
    | 'queued'          // Na fila aguardando processamento
    | 'processing'      // Upload de mídia em andamento
    | 'media_ready'     // Mídia uploaded, aguardando publicação
    | 'publishing'      // Chamando API de publicação
    | 'published'       // Publicado com sucesso
    | 'failed'          // Falhou (com retry info)
    | 'cancelled';      // Cancelado pelo usuário

export interface Publication {
    id: string;                               // UUID
    userId: string;                           // Referência ao StoredUser.id
    socialTokenId: string;                    // Referência ao SocialToken.id
    provider: 'instagram' | 'twitter';

    // Conteúdo
    mediaType: 'image' | 'video' | 'reel';
    mediaSourceId?: string;                   // ID da imagem/vídeo no sistema KlingAI
    mediaUrl: string;                         // URL da mídia (Azure Blob ou URL Kling)
    caption: string;
    hashtags: string[];

    // Status
    status: PublicationStatus;
    providerMediaId?: string;                 // ID da mídia na rede social
    providerPostId?: string;                  // ID do post na rede social
    providerPostUrl?: string;                 // URL direta do post publicado
    error?: string;

    // Retry
    retryCount: number;
    maxRetries: number;                       // Padrão: 3
    nextRetryAt?: string;                     // ISO 8601

    // Agendamento
    scheduledAt?: string;                     // ISO 8601 — se null, publica imediatamente
    publishedAt?: string;                     // ISO 8601

    // Timestamps
    createdAt: string;
    updatedAt: string;
}
```

### 3.5 Serviço de Publicação — Interface Unificada

```typescript
// server/src/services/social-publisher.service.ts

export interface MediaValidation {
    isValid: boolean;
    errors: string[];
    suggestions: string[];   // Ex: "Redimensionar para 1080×1350 para melhor performance"
}

export interface PublishResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
}

export interface SocialPublisher {
    validateMedia(mediaUrl: string, mediaType: 'image' | 'video'): Promise<MediaValidation>;
    processMedia(mediaUrl: string, mediaType: 'image' | 'video'): Promise<string>; // URL processada
    publish(publication: Publication, token: SocialToken): Promise<PublishResult>;
    deletePost(postId: string, token: SocialToken): Promise<void>;
}
```

### 3.6 Pipeline de Processamento de Mídia

```
┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐
│  Mídia   │────▶│  Validação   │────▶│ Processamento│───▶│  Upload  │
│  Original│     │  (formato,   │     │ (resize,    │     │  para    │
│  (Blob)  │     │   tamanho,   │     │  re-encode, │     │  Rede    │
│          │     │   ratio)     │     │  compress)  │     │  Social  │
└──────────┘     └──────────────┘     └────────────┘     └──────────┘
                        │                     │
                        ▼                     ▼
                 Rejeita com           Usa sharp (imagens)
                 mensagem clara        ou ffmpeg (vídeos)
```

### 3.7 Rotas de Publicação

```
POST   /api/social/publish                    → Publicar mídia em uma rede
POST   /api/social/publish/multi              → Publicar na mesma mídia em múltiplas redes
GET    /api/social/publications               → Listar publicações do usuário
GET    /api/social/publications/:id           → Detalhes de uma publicação
DELETE /api/social/publications/:id           → Cancelar/excluir publicação
POST   /api/social/publications/:id/retry     → Re-tentar publicação falha
POST   /api/social/validate-media             → Validar mídia antes de publicar
```

---

## 4. Monitoramento de Engajamento

### 4.1 Estratégia Híbrida: Webhooks + Polling Inteligente

```
┌──────────────────────────────────────────────────────────────────┐
│                    COLETA DE MÉTRICAS                              │
│                                                                    │
│  ┌────────────────────┐     ┌──────────────────────────────────┐  │
│  │  WEBHOOKS (tempo   │     │  POLLING INTELIGENTE             │  │
│  │  real)             │     │  (complementar)                  │  │
│  │                    │     │                                  │  │
│  │  Instagram:        │     │  Frequência adaptativa:          │  │
│  │  ✅ Comentários    │     │  • 0–1h: a cada 5 min            │  │
│  │  ✅ @menções       │     │  • 1–24h: a cada 30 min          │  │
│  │  ❌ Curtidas*      │     │  • 1–7d: a cada 2h               │  │
│  │  ❌ Alcance*       │     │  • 7d+: a cada 12h               │  │
│  │                    │     │                                  │  │
│  │  Twitter/X:        │     │  * Curtidas, shares e alcance    │  │
│  │  ❌ Sem webhooks   │     │    não têm webhook; polling      │  │
│  │     nativos        │     │    é necessário para essas       │  │
│  │                    │     │    métricas                      │  │
│  └────────────────────┘     └──────────────────────────────────┘  │
│                    │                      │                        │
│                    └──────────┬───────────┘                        │
│                               ▼                                    │
│                    ┌──────────────────────┐                        │
│                    │ engagement.service.ts │                        │
│                    │ (consolida e persiste)│                        │
│                    └──────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Webhooks — Instagram

O Instagram usa o sistema de Webhooks da Meta Platform:

**Configuração (uma vez no Meta Developer Dashboard):**
```
Webhook URL: https://kling-video-generator.azurewebsites.net/api/social/webhooks/instagram
Verify Token: (INSTAGRAM_WEBHOOK_VERIFY_TOKEN env var)
Assinaturas: comments, mentions
```

**Verificação do Webhook (GET):**
```typescript
// GET /api/social/webhooks/instagram?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=yyy
router.get('/webhooks/instagram', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.status(403).send('Forbidden');
    }
});
```

**Recebimento de Eventos (POST):**
```typescript
// POST /api/social/webhooks/instagram
// Payload: { object: "instagram", entry: [{ id, time, changes: [...] }] }
// Validar assinatura: X-Hub-Signature-256 header com HMAC SHA-256
```

### 4.3 Polling para Twitter/X

O Twitter API v2 não oferece webhooks gratuitos. Usamos polling com endpoints de métricas:

```
GET https://api.twitter.com/2/tweets/:id
    ?tweet.fields=public_metrics,organic_metrics,created_at
    → { data: { public_metrics: { retweet_count, reply_count, like_count, quote_count, impression_count } } }
```

### 4.4 Polling para Instagram Insights

```
GET https://graph.facebook.com/v21.0/{media_id}/insights
    ?metric=engagement,impressions,reach,saved,shares
    → { data: [{ name: "engagement", values: [{ value: 123 }] }] }
```

### 4.5 Modelo de Dados — Métricas de Engajamento

```typescript
// server/src/types/social.types.ts

export interface EngagementSnapshot {
    id: string;
    publicationId: string;                    // Referência à Publication
    provider: 'instagram' | 'twitter';
    providerPostId: string;
    
    // Métricas universais (normalizadas entre plataformas)
    metrics: {
        likes: number;
        comments: number;
        shares: number;                        // Retweets/Reposts no Twitter, Shares no IG
        saves: number;                         // Saves no Instagram, Bookmarks no Twitter
        impressions: number;                   // Vezes que apareceu em feeds
        reach: number;                         // Contas únicas alcançadas
        engagementRate: number;                // (likes+comments+shares) / impressions * 100
        videoViews?: number;                   // Apenas para vídeos
        videoWatchTime?: number;               // Segundos totais assistidos
    };

    // Métricas específicas por plataforma
    providerMetrics: {
        // Instagram-specific
        ig_saves?: number;
        ig_profile_visits?: number;
        ig_website_clicks?: number;

        // Twitter-specific
        tw_retweets?: number;
        tw_quote_tweets?: number;
        tw_bookmarks?: number;
        tw_url_clicks?: number;
    };

    collectedAt: string;                       // ISO 8601
    collectionMethod: 'webhook' | 'polling';
}

export interface EngagementSummary {
    publicationId: string;
    provider: 'instagram' | 'twitter';
    currentMetrics: EngagementSnapshot['metrics'];
    
    // Deltas (variação desde última coleta)
    deltas: {
        likes: number;
        comments: number;
        shares: number;
        impressions: number;
    };
    
    // Histórico para gráficos
    history: {
        timestamp: string;
        likes: number;
        comments: number;
        impressions: number;
    }[];
    
    lastUpdatedAt: string;
}
```

### 4.6 Rotas de Webhooks e Métricas

```
GET    /api/social/webhooks/instagram          → Verificação Meta webhook
POST   /api/social/webhooks/instagram          → Recebimento de eventos
GET    /api/social/engagement/:publicationId   → Métricas atuais de uma publicação
GET    /api/social/engagement/summary          → Resumo consolidado de todas as publicações
GET    /api/social/engagement/history/:id      → Histórico de métricas para gráficos
POST   /api/social/engagement/refresh/:id      → Força coleta imediata de métricas
```

---

## 5. Resiliência e Escalabilidade

### 5.1 Rate Limiting — Limites por Plataforma

| Plataforma | Limite | Janela | Ação |
|------------|--------|--------|------|
| Instagram — Content Publish | 25 posts | 24 horas | Fila com agendamento |
| Instagram — API Calls | 200 calls | 1 hora por user | Backoff exponencial |
| Instagram — Graph API | 4800 calls | 24 horas por app | Rate limiter global |
| Twitter — Tweets Create | 200 tweets | 15 min (app level) | Fila com delay |
| Twitter — Media Upload | 615 uploads | 15 min | Batch com spacing |
| Twitter — Read (GET) | 900 requests | 15 min per user | Cache local |

### 5.2 Serviço de Rate Limiting

```typescript
// server/src/services/rate-limiter.service.ts

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;             // Janela em milissegundos
    provider: 'instagram' | 'twitter';
    endpoint: string;             // Identificador do endpoint
}

interface RateLimitState {
    requests: number;
    windowStart: number;          // Timestamp do início da janela
    resetAt: number;              // Timestamp do próximo reset
    retryAfter?: number;          // Segundos para esperar (se rate limited)
}

export class RateLimiterService {
    private limits: Map<string, RateLimitState> = new Map();

    /**
     * Verifica se uma request pode ser feita
     * Retorna { allowed: true } ou { allowed: false, retryAfterMs: number }
     */
    canMakeRequest(userId: string, config: RateLimitConfig): {
        allowed: boolean;
        retryAfterMs?: number;
        remainingRequests?: number;
    };

    /**
     * Registra uma request feita
     * Também lê headers de rate limit da resposta da API:
     *   Instagram: x-app-usage, x-business-use-case-usage
     *   Twitter: x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset
     */
    recordRequest(userId: string, config: RateLimitConfig, responseHeaders?: Headers): void;

    /**
     * Aplica backoff exponencial
     * Base: 1s, multiplicador: 2, máx: 5 min, jitter: ±500ms
     */
    getBackoffDelay(retryCount: number): number {
        const base = 1000;
        const delay = Math.min(base * Math.pow(2, retryCount), 300_000);
        const jitter = Math.random() * 1000 - 500;
        return delay + jitter;
    }
}
```

### 5.3 Fila de Processamento Assíncrono

Na arquitetura atual (Azure App Service single-instance, armazenamento JSON), implementamos uma **fila in-process** com persistência em disco. Caso a plataforma escale para múltiplas instâncias, a fila migra para Redis/Azure Queue Storage.

```typescript
// server/src/services/social-queue.service.ts

export interface QueueJob {
    id: string;
    publicationId: string;
    type: 'publish' | 'collect_metrics' | 'refresh_token';
    priority: 'high' | 'normal' | 'low';
    scheduledAt: string;          // ISO 8601
    attempts: number;
    maxAttempts: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
    error?: string;
    createdAt: string;
    processedAt?: string;
}

export class SocialQueueService {
    private queue: QueueJob[] = [];
    private processing: boolean = false;
    private pollIntervalId?: NodeJS.Timeout;

    /**
     * Inicia o processamento da fila
     * Verifica a cada 10 segundos se há jobs pendentes
     */
    start(): void;

    /**
     * Adiciona um job à fila
     */
    enqueue(job: Omit<QueueJob, 'id' | 'attempts' | 'status' | 'createdAt'>): string;

    /**
     * Processa o próximo job na fila
     * Respeita rate limits, prioridade e scheduling
     */
    private async processNext(): Promise<void>;

    /**
     * Handler de retry com backoff exponencial
     * Após maxAttempts, move para dead-letter (status: 'dead')
     */
    private async handleFailure(job: QueueJob, error: Error): Promise<void>;

    /**
     * Persiste estado da fila em data/social-queue.json
     * Chamado após cada alteração de estado
     */
    private persist(): void;

    /**
     * Restaura fila do disco ao iniciar o servidor
     * Reprocessa jobs que estavam 'processing' quando o servidor caiu
     */
    private restore(): void;
}
```

### 5.4 Diagrama de Resiliência — Fluxo Completo de Publicação

```
Usuário clica "Publicar"
        │
        ▼
┌─────────────────┐
│ POST /api/social│     ┌──────────────────────┐
│ /publish        │────▶│ 1. Valida request    │
└─────────────────┘     │ 2. Valida token OAuth│
                        │ 3. Valida mídia      │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │ Rate Limit OK?        │
                        │                       │
                        │  ✅ Sim → Enqueue     │
                        │  ❌ Não → 429 + ETA   │
                        └──────────┬───────────┘
                                   │ ✅
                        ┌──────────▼───────────┐
                        │ SocialQueueService    │
                        │ processa job          │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │ Upload mídia para     │
                        │ rede social           │
                        │                       │
                        │  ✅ Sucesso           │
                        │  ❌ Falha:            │
                        │    retry < 3?         │
                        │    Sim → re-enqueue   │
                        │         + backoff     │
                        │    Não → dead-letter  │
                        │         + notifica    │
                        └──────────┬───────────┘
                                   │ ✅
                        ┌──────────▼───────────┐
                        │ Publicar post         │
                        │ Armazenar postId/URL  │
                        │ Agendar coleta de     │
                        │ métricas (5 min)      │
                        └──────────────────────┘
```

### 5.5 Caminho de Evolução para Escala

| Fase | Solução | Quando |
|------|---------|--------|
| **Atual** | Fila in-process + JSON em disco | < 50 users, single instance |
| **Fase 2** | Azure Queue Storage + Azure Table Storage | 50–500 users |
| **Fase 3** | Redis (Azure Cache) + PostgreSQL | 500+ users |
| **Fase 4** | Azure Service Bus + Azure Functions | Event-driven scale |

---

## 6. Modelo de Dados e Dashboard de Engajamento

### 6.1 Modelo de Dados Consolidado — Resumo

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MODELO DE DADOS                               │
│                                                                        │
│  users.json (existente)          social-tokens.json                    │
│  ┌────────────────────┐          ┌──────────────────────────────┐     │
│  │ StoredUser         │    1:N   │ SocialToken                  │     │
│  │ ─────────          │◄────────▶│ ─────────                    │     │
│  │ id                 │          │ id                            │     │
│  │ name               │          │ userId ──────────────────┐    │     │
│  │ email              │          │ provider (ig/tw)         │    │     │
│  │ role               │          │ accessToken (encrypted)  │    │     │
│  │ status             │          │ refreshToken (encrypted) │    │     │
│  └────────────────────┘          │ tokenExpiresAt           │    │     │
│                                  │ providerUsername          │    │     │
│                                  └──────────────────────────────┘     │
│                                              │                         │
│                                         1:N  │                         │
│                                              ▼                         │
│  publications.json                                                     │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ Publication                                                   │     │
│  │ ──────────                                                    │     │
│  │ id                    socialTokenId ──────────────────────┘    │     │
│  │ userId                                                        │     │
│  │ provider              mediaType (image/video/reel)            │     │
│  │ mediaUrl              caption                                 │     │
│  │ status                providerPostId                          │     │
│  │ providerPostUrl       retryCount                              │     │
│  │ scheduledAt           publishedAt                             │     │
│  └──────────────────────────────┬───────────────────────────────┘     │
│                                 │                                      │
│                            1:N  │                                      │
│                                 ▼                                      │
│  engagement-metrics.json                                               │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ EngagementSnapshot                                            │     │
│  │ ──────────────────                                            │     │
│  │ id                   publicationId ──────────────────────┘    │     │
│  │ provider                                                      │     │
│  │ metrics: { likes, comments, shares, saves,                    │     │
│  │           impressions, reach, engagementRate }                │     │
│  │ collectedAt          collectionMethod                         │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  social-queue.json                                                     │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ QueueJob                                                      │     │
│  │ ────────                                                      │     │
│  │ id, publicationId, type, priority, scheduledAt, attempts      │     │
│  │ status: pending|processing|completed|failed|dead              │     │
│  └──────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Dashboard de Engajamento — Componentes Frontend

```
┌──────────────────────────────────────────────────────────────────┐
│  📊 Social Media Dashboard                               [7 dias ▼]  │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Total    │  │ Total    │  │ Alcance  │  │ Taxa de  │             │
│  │ Posts    │  │ Curtidas │  │ Total    │  │ Engaj.   │             │
│  │   12     │  │  1.284   │  │  45.2K   │  │  4.7%    │             │
│  │  ↑ 3     │  │  ↑ 312   │  │  ↑ 12K   │  │  ↑ 0.3%  │             │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  📈 Engajamento ao Longo do Tempo                  [IG] [TW]│     │
│  │                                                               │     │
│  │  ▲                                    ╱╲                      │     │
│  │  │              ╱╲    ╱╲            ╱    ╲                    │     │
│  │  │    ╱╲      ╱    ╲╱    ╲        ╱        ╲                 │     │
│  │  │  ╱    ╲  ╱                ╲  ╱            ╲               │     │
│  │  │╱        ╲                    ╲              ╲              │     │
│  │  └──────────────────────────────────────────────────▶        │     │
│  │    Seg    Ter    Qua    Qui    Sex    Sab    Dom              │     │
│  │    ── Curtidas  ── Comentários  ── Compartilhamentos         │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐     │
│  │ 🏆 Top Posts             │  │ 📊 Comparativo por Rede      │     │
│  │                          │  │                              │     │
│  │ 1. [img] Sunset...       │  │   Instagram ████████░░ 68%  │     │
│  │    ❤️ 456  💬 23  📤 12  │  │   Twitter   ███░░░░░░░ 32%  │     │
│  │                          │  │                              │     │
│  │ 2. [vid] Dance...        │  │   ── Curtidas                │     │
│  │    ❤️ 312  💬 45  📤 8   │  │   ── Comentários             │     │
│  │                          │  │   ── Compartilhamentos       │     │
│  │ 3. [img] Portrait...     │  │                              │     │
│  │    ❤️ 234  💬 12  📤 5   │  │                              │     │
│  └──────────────────────────┘  └──────────────────────────────┘     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ 📋 Publicações Recentes                        [Todas ▼]    │     │
│  │                                                               │     │
│  │ ┌────┬──────────┬──────┬────────┬────────┬─────────┬──────┐  │     │
│  │ │    │ Conteúdo │ Rede │ Status │ Engaj. │ Alcance │ Data │  │     │
│  │ ├────┼──────────┼──────┼────────┼────────┼─────────┼──────┤  │     │
│  │ │[📸]│ Sunset.. │  IG  │✅ Publ.│  491   │  12.3K  │ 07/02│  │     │
│  │ │[🎬]│ Dance..  │ TW+IG│✅ Publ.│  365   │   8.7K  │ 06/02│  │     │
│  │ │[📸]│ Coffee.. │  TW  │⏳ Fila │   —    │    —    │ 07/02│  │     │
│  │ └────┴──────────┴──────┴────────┴────────┴─────────┴──────┘  │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 Rotas da API — Dashboard

```
GET    /api/social/dashboard/summary           → Cards de resumo (total posts, likes, reach, rate)
GET    /api/social/dashboard/chart             → Dados para gráfico de engajamento (time-series)
       ?period=7d|30d|90d&provider=all|instagram|twitter
GET    /api/social/dashboard/top-posts         → Top N posts por engajamento
GET    /api/social/dashboard/comparison        → Comparativo entre redes
```

### 6.4 Interfaces de Dados — Dashboard API

```typescript
// Resposta de /api/social/dashboard/summary
export interface DashboardSummary {
    period: '7d' | '30d' | '90d';
    totalPosts: number;
    totalPostsDelta: number;           // Variação vs período anterior
    totalLikes: number;
    totalLikesDelta: number;
    totalReach: number;
    totalReachDelta: number;
    avgEngagementRate: number;
    avgEngagementRateDelta: number;
    byProvider: {
        instagram: { posts: number; likes: number; reach: number; engagementRate: number };
        twitter: { posts: number; likes: number; reach: number; engagementRate: number };
    };
}

// Resposta de /api/social/dashboard/chart
export interface DashboardChartData {
    period: string;
    provider: 'all' | 'instagram' | 'twitter';
    dataPoints: {
        date: string;                    // ISO date (YYYY-MM-DD)
        likes: number;
        comments: number;
        shares: number;
        impressions: number;
        reach: number;
    }[];
}

// Resposta de /api/social/dashboard/top-posts
export interface TopPost {
    publicationId: string;
    provider: 'instagram' | 'twitter';
    mediaType: 'image' | 'video' | 'reel';
    caption: string;
    thumbnailUrl?: string;
    postUrl: string;
    metrics: {
        likes: number;
        comments: number;
        shares: number;
        engagementRate: number;
    };
    publishedAt: string;
}
```

---

## 7. Estrutura de Arquivos do Módulo

```
server/src/
├── routes/
│   ├── social.routes.ts           # Router principal — monta sub-routers
│   ├── social-oauth.routes.ts     # OAuth init + callback (IG & TW)
│   ├── social-publish.routes.ts   # Publicação e gestão de publicações
│   ├── social-webhook.routes.ts   # Recebimento de webhooks
│   └── social-dashboard.routes.ts # Endpoints do dashboard de métricas
│
├── services/
│   ├── crypto.service.ts          # Criptografia AES-256-GCM para tokens
│   ├── oauth.service.ts           # Lógica OAuth genérica
│   ├── instagram.service.ts       # Instagram Graph API
│   ├── twitter.service.ts         # Twitter API v2
│   ├── social-publisher.service.ts# Publisher abstrato + processamento de mídia
│   ├── social-queue.service.ts    # Fila de jobs com persistência
│   ├── rate-limiter.service.ts    # Controle de rate limiting
│   ├── engagement.service.ts      # Coleta e consolidação de métricas
│   └── social-token.store.ts      # CRUD de tokens OAuth (JSON storage)
│
├── types/
│   └── social.types.ts            # Todos os tipos do módulo social
│
└── data/                          # Persistência em JSON (auto-criado)
    ├── social-tokens.json
    ├── publications.json
    ├── engagement-metrics.json
    └── social-queue.json

src/
├── pages/
│   ├── SocialHub.tsx              # Página principal — publicar em redes
│   └── SocialDashboard.tsx        # Dashboard de engajamento
│
├── components/
│   └── social/
│       ├── ConnectAccountCard.tsx  # Card para conectar IG/TW
│       ├── PublishModal.tsx        # Modal de publicação com preview
│       ├── MediaValidator.tsx      # Preview de como a mídia ficará
│       ├── EngagementChart.tsx     # Gráfico de engajamento (recharts)
│       ├── TopPostsGrid.tsx       # Grid dos melhores posts
│       ├── PublicationsList.tsx    # Lista de publicações recentes
│       └── ProviderComparison.tsx # Gráfico comparativo entre redes
│
├── hooks/
│   ├── useSocialAuth.ts           # Hook para conexão OAuth
│   ├── useSocialPublish.ts        # Hook para publicação
│   └── useSocialMetrics.ts        # Hook para métricas e dashboard
│
└── types/
    └── social.ts                   # Tipos frontend espelhando backend
```

---

## 8. Variáveis de Ambiente

```env
# ── Instagram (Meta) ──
META_APP_ID=                           # App ID do Meta Developer Dashboard
META_APP_SECRET=                       # App Secret
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=        # Token para verificação do webhook Meta

# ── Twitter/X ──
TWITTER_CLIENT_ID=                     # OAuth 2.0 Client ID
TWITTER_CLIENT_SECRET=                 # OAuth 2.0 Client Secret (para server-side)

# ── Segurança ──
SOCIAL_ENCRYPTION_KEY=                 # Chave AES-256 hex (64 chars) para criptografar tokens
SOCIAL_OAUTH_CALLBACK_BASE=https://kling-video-generator.azurewebsites.net  # Base URL para callbacks

# ── Já existentes (referência) ──
SESSION_SECRET=                        # JWT de sessão (já configurado)
ADMIN_EMAIL=                           # Admin padrão (já configurado)
ADMIN_PASSWORD=                        # Senha admin (já configurado)
```

---

## 9. Dependências Necessárias

### Backend (adicionar ao `server/package.json`)

```json
{
    "sharp": "^0.33.0",              // Processamento de imagens (resize, format)
    "node-fetch": "^3.3.0",         // HTTP client para APIs sociais (caso não use fetch nativo)
    "form-data": "^4.0.0"           // Multipart upload para Twitter media
}
```

> **Nota**: `crypto` (criptografia), `fs` (persistência JSON), e `fetch` (Node 20 built-in) já estão disponíveis nativamente. `jsonwebtoken` já está instalado.

> **Nota sobre FFmpeg**: Para processamento de vídeo (re-encode, resize), usar `ffmpeg` via Azure App Service custom startup ou `@ffmpeg/ffmpeg` (WASM). Avaliação de viabilidade necessária.

### Frontend (já disponível)

- `recharts` — já instalado, usado para gráficos do dashboard
- `lucide-react` — ícones
- `framer-motion` — animações
- `react-router-dom` — rotas

---

## 10. Plano de Implementação por Fases

### Fase 1 — Fundação (Semana 1–2)
| # | Tarefa | Arquivos |
|---|--------|----------|
| 1.1 | Tipos TypeScript do módulo social | `social.types.ts` |
| 1.2 | Serviço de criptografia | `crypto.service.ts` |
| 1.3 | Store de tokens sociais (CRUD + JSON) | `social-token.store.ts` |
| 1.4 | Rate Limiter Service | `rate-limiter.service.ts` |
| 1.5 | Fila de processamento base | `social-queue.service.ts` |

### Fase 2 — OAuth (Semana 2–3)
| # | Tarefa | Arquivos |
|---|--------|----------|
| 2.1 | OAuth Service — Instagram | `oauth.service.ts`, `instagram.service.ts` |
| 2.2 | OAuth Service — Twitter | `twitter.service.ts` |
| 2.3 | Rotas OAuth (init + callback) | `social-oauth.routes.ts` |
| 2.4 | Frontend — ConnectAccountCard | `ConnectAccountCard.tsx` |
| 2.5 | Registrar rotas no `index.ts` | `index.ts` |

### Fase 3 — Publicação (Semana 3–4)
| # | Tarefa | Arquivos |
|---|--------|----------|
| 3.1 | Instagram Publisher (container → publish) | `instagram.service.ts` |
| 3.2 | Twitter Publisher (chunked upload → tweet) | `twitter.service.ts` |
| 3.3 | Pipeline de validação/processamento de mídia | `social-publisher.service.ts` |
| 3.4 | Rotas de publicação | `social-publish.routes.ts` |
| 3.5 | Frontend — SocialHub + PublishModal | `SocialHub.tsx`, `PublishModal.tsx` |
| 3.6 | Integração nas galerias (botão "Publicar") | `Gallery.tsx`, `ImageGallery.tsx` |

### Fase 4 — Engajamento (Semana 4–5)
| # | Tarefa | Arquivos |
|---|--------|----------|
| 4.1 | Webhook handler Instagram | `social-webhook.routes.ts` |
| 4.2 | Polling service para métricas | `engagement.service.ts` |
| 4.3 | Rotas do dashboard | `social-dashboard.routes.ts` |
| 4.4 | Frontend — SocialDashboard | `SocialDashboard.tsx` |
| 4.5 | Componentes de gráficos | `EngagementChart.tsx`, etc. |

### Fase 5 — Integração e Polish (Semana 5–6)
| # | Tarefa | Arquivos |
|---|--------|----------|
| 5.1 | Sidebar — novas entradas | `Sidebar.tsx` |
| 5.2 | App.tsx — novas rotas | `App.tsx` |
| 5.3 | Widget social no Dashboard existente | `Dashboard.tsx` |
| 5.4 | Testes end-to-end | Manual + scripts |
| 5.5 | Deploy e configuração de env vars | Azure CLI |
| 5.6 | Configuração de webhooks no Meta Dashboard | Manual |

---

## Apêndice A — Pré-requisitos Externos

### Instagram
1. **Meta Developer Account** — https://developers.facebook.com
2. **Meta App** criado com produto "Instagram Graph API" habilitado
3. **Business Verification** concluída (obrigatória para permissões `instagram_content_publish`)
4. **Facebook Page** conectada a uma **Instagram Business/Creator Account**
5. Webhook URL registrada e verificada no Meta Dashboard

### Twitter/X
1. **Twitter Developer Account** — https://developer.twitter.com
2. **Project + App** criados no Developer Portal
3. **OAuth 2.0** habilitado com tipo "Web App" (inclui PKCE)
4. **Elevated access** ou **Basic tier** (para media upload e tweet creation)
5. Callback URL registrada: `{SOCIAL_OAUTH_CALLBACK_BASE}/api/social/oauth/twitter/callback`

---

## Apêndice B — Considerações de Segurança

| Risco | Mitigação |
|-------|-----------|
| Tokens OAuth em repouso | Criptografia AES-256-GCM com chave em env var |
| Tokens OAuth em trânsito | HTTPS obrigatório (Azure já enforça) |
| CSRF no OAuth flow | State parameter com UUID + validação |
| PKCE downgrade (Twitter) | Code verifier gerado server-side, vinculado à sessão |
| Webhook spoofing (Instagram) | Validação de `X-Hub-Signature-256` com App Secret |
| Rate limit abuse por usuário | Per-user rate limiting + global app-level limits |
| Token revogado pelo usuário na rede social | Validação periódica + graceful degradation |
| JSON storage corruption | Atomic writes (write to temp → rename) + backup periódico |
