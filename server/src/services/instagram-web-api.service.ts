// ============================================================================
// Instagram Web API Service — Integração via endpoints web (sem mobile API)
// ============================================================================
// Alternativa ao instagram-private-api que usa a API mobile (bloqueada em IPs
// de datacenter). Este serviço emula um navegador Chrome acessando a versão
// web do Instagram, usando endpoints como:
//   - /accounts/login/ajax/          (login)
//   - /api/v1/                       (API v1 web)
//   - /graphql/query/                (GraphQL)
//   - /rupload_igphoto/              (upload de fotos)
//   - /rupload_igvideo/              (upload de vídeos)
//   - /api/v1/media/configure/       (publicar foto)
//   - /api/v1/media/configure/?video=1 (publicar vídeo)
//   - /api/v1/media/configure_to_story/ (publicar story)
//   - /api/v1/media/configure_to_clips/ (publicar reel)
//
// Baseado na referência Python: docs/referencia/instagram_web_api.py
//
// ⚠️  RISCOS: Viola ToS do Instagram. Conta pode ser banida.
//     Use apenas para testes. Não recomendado para produção.
// ============================================================================

import { encrypt, decrypt } from './crypto.service.js';
import type { SocialToken, PlatformMediaLimits } from '../types/social.types.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ── Constantes ─────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.instagram.com';
const API_URL = 'https://www.instagram.com/api/v1';
const GRAPHQL_URL = 'https://www.instagram.com/graphql/query';
const IG_APP_ID = '936619743392459';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface IGWebCredentials {
    username: string;
    password: string;
}

export interface IGWebSession {
    username: string;
    userId: string;
    profilePicUrl?: string;
    fullName?: string;
    followersCount?: number;
    followingCount?: number;
    mediaCount?: number;
    cookies: Record<string, string>;
    csrfToken: string;
}

export interface IGWebUser {
    pk: number;
    username: string;
    fullName: string;
    biography?: string;
    followerCount: number;
    followingCount: number;
    mediaCount: number;
    isPrivate: boolean;
    isVerified: boolean;
    profilePicUrl: string;
    externalUrl?: string;
}

export interface IGWebMedia {
    pk: number;
    id: string;
    code: string;
    captionText: string;
    likeCount: number;
    commentCount: number;
    mediaType: number; // 1=photo, 2=video, 8=album
    takenAt?: Date;
    imageUrl: string;
    userId?: number;
}

export interface IGWebUploadResult {
    success: boolean;
    mediaId?: string;
    mediaCode?: string;
    postUrl?: string;
    error?: string;
}

// ── Media Limits ───────────────────────────────────────────────────────────

export const INSTAGRAM_WEB_MEDIA_LIMITS: PlatformMediaLimits = {
    image: {
        maxSizeBytes: 8 * 1024 * 1024,     // 8 MB
        allowedFormats: ['image/jpeg', 'image/png'],
        maxWidth: 1440,
        maxHeight: 1440,
        minWidth: 320,
        minHeight: 320,
        aspectRatios: ['4:5', '1:1', '1.91:1'],
    },
    video: {
        maxSizeBytes: 100 * 1024 * 1024,   // 100 MB (feed)
        allowedFormats: ['video/mp4'],
        maxWidth: 1920,
        maxHeight: 1080,
        minWidth: 600,
        minHeight: 600,
        maxDurationSeconds: 60,
        minDurationSeconds: 3,
    },
    reel: {
        maxSizeBytes: 250 * 1024 * 1024,   // 250 MB
        allowedFormats: ['video/mp4'],
        maxWidth: 1080,
        maxHeight: 1920,
        minWidth: 540,
        minHeight: 960,
        aspectRatios: ['9:16'],
        maxDurationSeconds: 90,
        minDurationSeconds: 3,
    },
    captionMaxLength: 2200,
};

// ── Classe principal ───────────────────────────────────────────────────────

export class InstagramWebAPI {
    private cookies: Map<string, string> = new Map();
    private csrfToken = '';
    private userId: string | null = null;
    private username: string | null = null;
    private isAuthenticated = false;
    private proxyUrl: string | null = null;
    private proxyAgent: HttpsProxyAgent<string> | null = null;

    constructor() {
        // Configurar proxy via env se disponível
        const proxy = process.env.INSTAGRAM_PROXY || process.env.HTTPS_PROXY;
        if (proxy) {
            this.setProxy(proxy);
        }
    }

    // ── Proxy ──────────────────────────────────────────────────────────────

    setProxy(proxyUrl: string): void {
        this.proxyUrl = proxyUrl;
        this.proxyAgent = new HttpsProxyAgent(proxyUrl);
        console.log(`[IG-Web] Proxy configurado: ${proxyUrl.substring(0, 40)}...`);
    }

    // ── Delay helper ───────────────────────────────────────────────────────

    private delay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
        const ms = minMs + Math.random() * (maxMs - minMs);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Cookie management ──────────────────────────────────────────────────

    private parseCookies(setCookieHeaders: string[]): void {
        for (const header of setCookieHeaders) {
            const parts = header.split(';')[0].split('=');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                this.cookies.set(name, value);
            }
        }
    }

    private getCookieString(): string {
        return Array.from(this.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    private refreshCsrf(): void {
        const csrf = this.cookies.get('csrftoken') || '';
        if (csrf) {
            this.csrfToken = csrf;
        }
    }

    // ── Headers ────────────────────────────────────────────────────────────

    private getBaseHeaders(): Record<string, string> {
        return {
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Origin': BASE_URL,
            'Referer': `${BASE_URL}/`,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Cookie': this.getCookieString(),
        };
    }

    private getAjaxHeaders(): Record<string, string> {
        this.refreshCsrf();
        return {
            ...this.getBaseHeaders(),
            'X-Requested-With': 'XMLHttpRequest',
            'X-Instagram-AJAX': '1',
            'X-IG-App-ID': IG_APP_ID,
            'X-CSRFToken': this.csrfToken,
            'Content-Type': 'application/x-www-form-urlencoded',
        };
    }

    // ── HTTP helpers ───────────────────────────────────────────────────────

    private getFetchOptions(): RequestInit {
        const opts: RequestInit = {};
        if (this.proxyAgent) {
            (opts as any).agent = this.proxyAgent;
        }
        return opts;
    }

    private async apiGet(endpoint: string, params?: Record<string, string>, retries = 2): Promise<any> {
        const url = new URL(`${API_URL}/${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        }

        this.refreshCsrf();

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await this.delay(500, 1500);
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: this.getAjaxHeaders(),
                    ...this.getFetchOptions(),
                });

                // Capturar cookies da resposta
                const setCookies = response.headers.getSetCookie?.() || [];
                this.parseCookies(setCookies);

                if (response.status === 429 && attempt < retries) {
                    const wait = 30 * (attempt + 1);
                    console.warn(`[IG-Web] Rate limit (429). Aguardando ${wait}s... (tentativa ${attempt + 1}/${retries})`);
                    await new Promise(r => setTimeout(r, wait * 1000));
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                if (attempt === retries) throw error;
                console.warn(`[IG-Web] API GET ${endpoint}: tentativa ${attempt + 1} falhou`, error);
            }
        }
    }

    private async apiPost(endpoint: string, data?: Record<string, string>, retries = 2): Promise<any> {
        const url = `${API_URL}/${endpoint}`;
        this.refreshCsrf();

        const body = data ? new URLSearchParams(data).toString() : '';

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await this.delay(500, 1500);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: this.getAjaxHeaders(),
                    body,
                    ...this.getFetchOptions(),
                });

                const setCookies = response.headers.getSetCookie?.() || [];
                this.parseCookies(setCookies);

                if (response.status === 429 && attempt < retries) {
                    const wait = 30 * (attempt + 1);
                    console.warn(`[IG-Web] Rate limit (429). Aguardando ${wait}s...`);
                    await new Promise(r => setTimeout(r, wait * 1000));
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                if (attempt === retries) throw error;
                console.warn(`[IG-Web] API POST ${endpoint}: tentativa ${attempt + 1} falhou`, error);
            }
        }
    }

    private async webPost(path: string, data?: Record<string, string>): Promise<any> {
        const url = `${BASE_URL}${path}`;
        this.refreshCsrf();

        const body = data ? new URLSearchParams(data).toString() : '';

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getAjaxHeaders(),
            body,
            ...this.getFetchOptions(),
        });

        const setCookies = response.headers.getSetCookie?.() || [];
        this.parseCookies(setCookies);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    // ── Login / Sessão ─────────────────────────────────────────────────────

    async login(username: string, password: string): Promise<boolean> {
        console.log(`[IG-Web] Iniciando login web para @${username}...`);

        // 1. Visitar página principal para obter cookies/CSRF
        try {
            const response = await fetch(`${BASE_URL}/`, {
                method: 'GET',
                headers: this.getBaseHeaders(),
                redirect: 'follow',
                ...this.getFetchOptions(),
            });

            const setCookies = response.headers.getSetCookie?.() || [];
            this.parseCookies(setCookies);
            this.refreshCsrf();
        } catch (error) {
            console.error(`[IG-Web] Erro ao acessar instagram.com:`, error);
            return false;
        }

        if (!this.csrfToken) {
            console.error('[IG-Web] Não foi possível obter token CSRF');
            return false;
        }

        await this.delay(1000, 3000);

        // 2. Login via AJAX
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const body = new URLSearchParams({
                username,
                enc_password: `#PWD_INSTAGRAM_BROWSER:0:${timestamp}:${password}`,
                queryParams: '{}',
                optIntoOneTap: 'false',
            }).toString();

            const response = await fetch(`${BASE_URL}/accounts/login/ajax/`, {
                method: 'POST',
                headers: this.getAjaxHeaders(),
                body,
                ...this.getFetchOptions(),
            });

            const setCookies = response.headers.getSetCookie?.() || [];
            this.parseCookies(setCookies);

            const data = await response.json();
            console.log('[IG-Web] Login response status:', data.status, 'authenticated:', data.authenticated);

            if (data.authenticated) {
                this.userId = String(data.userId || '');
                this.username = username;
                this.isAuthenticated = true;
                this.refreshCsrf();
                console.log(`[IG-Web] Login OK! userId=${this.userId}`);
                return true;
            }

            if (data.checkpoint_url) {
                console.warn(`[IG-Web] Checkpoint requerido: ${data.checkpoint_url}`);
                // Não podemos resolver checkpoint automaticamente no backend
                throw new Error('CHECKPOINT_REQUIRED: Instagram solicitou verificação de segurança. Verifique seu email/telefone no app do Instagram e tente novamente.');
            }

            if (data.two_factor_required) {
                console.warn('[IG-Web] 2FA requerido');
                throw new Error('TWO_FACTOR_REQUIRED: Autenticação de dois fatores necessária. Desative temporariamente o 2FA ou use a API oficial.');
            }

            const msg = data.message || 'Login falhou';
            console.error(`[IG-Web] Login falhou: ${msg}`);
            throw new Error(`LOGIN_FAILED: ${msg}`);

        } catch (error: any) {
            if (error.message?.startsWith('CHECKPOINT_REQUIRED') ||
                error.message?.startsWith('TWO_FACTOR_REQUIRED') ||
                error.message?.startsWith('LOGIN_FAILED')) {
                throw error;
            }
            console.error(`[IG-Web] Erro no login:`, error);
            throw new Error(`LOGIN_ERROR: ${error.message || 'Erro desconhecido no login'}`);
        }
    }

    // ── Sessão: salvar/carregar ────────────────────────────────────────────

    getSessionData(): IGWebSession | null {
        if (!this.isAuthenticated || !this.userId || !this.username) return null;

        const cookiesObj: Record<string, string> = {};
        for (const [name, value] of this.cookies.entries()) {
            cookiesObj[name] = value;
        }

        return {
            username: this.username,
            userId: this.userId,
            cookies: cookiesObj,
            csrfToken: this.csrfToken,
        };
    }

    async loadSession(session: IGWebSession): Promise<boolean> {
        try {
            // Restaurar cookies
            this.cookies.clear();
            for (const [name, value] of Object.entries(session.cookies)) {
                this.cookies.set(name, value);
            }

            this.userId = session.userId;
            this.username = session.username;
            this.csrfToken = session.csrfToken;

            // Verificar se sessão é válida
            if (await this.verifySession()) {
                this.isAuthenticated = true;
                console.log(`[IG-Web] Sessão restaurada: @${this.username}`);
                return true;
            }

            console.warn('[IG-Web] Sessão expirada');
            return false;
        } catch (error) {
            console.warn('[IG-Web] Erro ao carregar sessão:', error);
            return false;
        }
    }

    private async verifySession(): Promise<boolean> {
        try {
            const response = await fetch(`${API_URL}/accounts/edit/web_form_data/`, {
                method: 'GET',
                headers: this.getAjaxHeaders(),
                ...this.getFetchOptions(),
            });

            const setCookies = response.headers.getSetCookie?.() || [];
            this.parseCookies(setCookies);

            if (response.ok) {
                const data = await response.json();
                return data.status === 'ok' || 'form_data' in data;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ── Perfil / Usuário ───────────────────────────────────────────────────

    async getUserInfo(username: string): Promise<IGWebUser | null> {
        try {
            const data = await this.apiGet('users/web_profile_info/', {
                username,
            });

            const userData = data?.data?.user;
            if (!userData) return null;

            return {
                pk: parseInt(userData.id || '0', 10),
                username: userData.username || '',
                fullName: userData.full_name || '',
                biography: userData.biography || '',
                followerCount: userData.edge_followed_by?.count || 0,
                followingCount: userData.edge_follow?.count || 0,
                mediaCount: userData.edge_owner_to_timeline_media?.count || 0,
                isPrivate: userData.is_private || false,
                isVerified: userData.is_verified || false,
                profilePicUrl: userData.profile_pic_url_hd || '',
                externalUrl: userData.external_url || '',
            };
        } catch (error) {
            console.error(`[IG-Web] Erro ao buscar perfil @${username}:`, error);
            return null;
        }
    }

    async getAccountInfo(): Promise<IGWebUser | null> {
        if (this.username) {
            return this.getUserInfo(this.username);
        }
        return null;
    }

    // ── Upload: Foto binária (rupload_igphoto) ─────────────────────────────

    private async uploadPhotoBinary(imageBuffer: Buffer, uploadId: string, contentType = 'image/jpeg'): Promise<boolean> {
        const uploadName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000 + 1000000000)}`;

        const ruploadParams = {
            retry_context: JSON.stringify({
                num_step_auto_retry: 0, num_reupload: 0, num_step_manual_retry: 0,
            }),
            media_type: '1',
            xsharing_user_ids: '[]',
            upload_id: uploadId,
            image_compression: JSON.stringify({
                lib_name: 'moz', lib_version: '3.1.m', quality: '80',
            }),
        };

        const headers: Record<string, string> = {
            ...this.getBaseHeaders(),
            'X-Entity-Name': uploadName,
            'X-Entity-Length': String(imageBuffer.length),
            'X-Entity-Type': contentType,
            'X-Instagram-Rupload-Params': JSON.stringify(ruploadParams),
            'X-CSRFToken': this.csrfToken,
            'X-IG-App-ID': IG_APP_ID,
            'Offset': '0',
            'Content-Type': 'application/octet-stream',
        };

        try {
            const response = await fetch(`https://www.instagram.com/rupload_igphoto/${uploadName}`, {
                method: 'POST',
                headers,
                body: new Uint8Array(imageBuffer),
                ...this.getFetchOptions(),
            });

            const setCookies = response.headers.getSetCookie?.() || [];
            this.parseCookies(setCookies);

            if (response.ok) {
                const result = await response.json();
                console.log(`[IG-Web] Foto uploaded: ${result.status || 'ok'}`);
                return true;
            }

            console.error(`[IG-Web] Upload foto falhou: HTTP ${response.status}`);
            return false;
        } catch (error) {
            console.error('[IG-Web] Erro no upload de foto:', error);
            return false;
        }
    }

    // ── Upload: Vídeo binário (rupload_igvideo) ────────────────────────────

    private async uploadVideoBinary(
        videoBuffer: Buffer,
        uploadId: string,
        videoInfo: { durationMs: number; width: number; height: number },
        options: { isClips?: boolean; isStory?: boolean } = {},
    ): Promise<boolean> {
        const waterfallId = crypto.randomUUID();
        const uploadName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000 + 1000000000)}`;

        const ruploadParams: Record<string, string> = {
            retry_context: JSON.stringify({
                num_step_auto_retry: 0, num_reupload: 0, num_step_manual_retry: 0,
            }),
            media_type: '2',
            xsharing_user_ids: this.userId ? JSON.stringify([this.userId]) : '[]',
            upload_id: uploadId,
            upload_media_duration_ms: String(videoInfo.durationMs),
            upload_media_width: String(videoInfo.width),
            upload_media_height: String(videoInfo.height),
        };

        if (options.isClips) {
            ruploadParams['is_clips_video'] = '1';
        }
        if (options.isStory) {
            ruploadParams['extract_cover_frame'] = '1';
            ruploadParams['content_tags'] = 'has-overlay';
            ruploadParams['for_album'] = '1';
        }

        const rpJson = JSON.stringify(ruploadParams);

        // Fase 1: Inicializar upload (GET)
        const initHeaders: Record<string, string> = {
            ...this.getBaseHeaders(),
            'Accept-Encoding': 'gzip, deflate',
            'X-Instagram-Rupload-Params': rpJson,
            'X_FB_VIDEO_WATERFALL_ID': waterfallId,
            'X-Entity-Type': 'video/mp4',
            'X-Entity-Name': uploadName,
            'X-Entity-Length': String(videoBuffer.length),
        };

        try {
            await fetch(`https://www.instagram.com/rupload_igvideo/${uploadName}`, {
                method: 'GET',
                headers: initHeaders,
                ...this.getFetchOptions(),
            });

            // Fase 2: Enviar bytes (POST)
            const uploadHeaders: Record<string, string> = {
                ...this.getBaseHeaders(),
                'Offset': '0',
                'X-Entity-Name': uploadName,
                'X-Entity-Length': String(videoBuffer.length),
                'Content-Type': 'application/octet-stream',
                'X-Entity-Type': 'video/mp4',
                'X-Instagram-Rupload-Params': rpJson,
                'X_FB_VIDEO_WATERFALL_ID': waterfallId,
                'X-CSRFToken': this.csrfToken,
                'X-IG-App-ID': IG_APP_ID,
            };

            const response = await fetch(`https://www.instagram.com/rupload_igvideo/${uploadName}`, {
                method: 'POST',
                headers: uploadHeaders,
                body: new Uint8Array(videoBuffer),
                ...this.getFetchOptions(),
            });

            const setCookies = response.headers.getSetCookie?.() || [];
            this.parseCookies(setCookies);

            if (response.ok) {
                const result = await response.json();
                console.log(`[IG-Web] Vídeo uploaded: ${result.status || 'ok'}`);
                return true;
            }

            console.error(`[IG-Web] Upload vídeo falhou: HTTP ${response.status}`);
            return false;
        } catch (error) {
            console.error('[IG-Web] Erro no upload de vídeo:', error);
            return false;
        }
    }

    // ── Publicar: Foto no Feed ─────────────────────────────────────────────

    async publishPhoto(imageBuffer: Buffer, caption: string, contentType = 'image/jpeg'): Promise<IGWebUploadResult> {
        if (!this.isAuthenticated) {
            return { success: false, error: 'Não autenticado' };
        }

        try {
            const uploadId = String(Date.now());

            if (!await this.uploadPhotoBinary(imageBuffer, uploadId, contentType)) {
                return { success: false, error: 'Falha no upload da imagem' };
            }

            await this.delay(2000, 4000);
            this.refreshCsrf();

            const configureData: Record<string, string> = {
                upload_id: uploadId,
                caption,
                usertags: '',
                custom_accessibility_caption: '',
                retry_timeout: '',
            };

            const result = await this.apiPost('media/configure/', configureData);

            if (result?.status === 'ok') {
                const media = result.media || {};
                const code = media.code || '';
                const postUrl = `https://www.instagram.com/p/${code}/`;
                console.log(`[IG-Web] 📸 Foto publicada no feed! ${postUrl}`);
                return {
                    success: true,
                    mediaId: media.id || media.pk?.toString(),
                    mediaCode: code,
                    postUrl,
                };
            }

            console.error('[IG-Web] Configure feed falhou:', result);
            return { success: false, error: 'Falha ao configurar post' };
        } catch (error: any) {
            console.error('[IG-Web] Erro no upload de foto:', error);
            return { success: false, error: error.message || 'Erro no upload' };
        }
    }

    // ── Publicar: Vídeo no Feed ────────────────────────────────────────────

    async publishVideo(
        videoBuffer: Buffer,
        caption: string,
        thumbnailBuffer?: Buffer,
        videoInfo: { durationMs: number; width: number; height: number } = {
            durationMs: 15000, width: 1080, height: 1920,
        },
    ): Promise<IGWebUploadResult> {
        if (!this.isAuthenticated) {
            return { success: false, error: 'Não autenticado' };
        }

        try {
            const uploadId = String(Date.now());

            console.log(`[IG-Web] 📹 Enviando vídeo: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.durationMs / 1000}s`);

            // 1. Upload do vídeo
            if (!await this.uploadVideoBinary(videoBuffer, uploadId, videoInfo)) {
                return { success: false, error: 'Falha no upload do vídeo' };
            }

            // 2. Upload da thumbnail (se fornecida)
            if (thumbnailBuffer) {
                await this.uploadPhotoBinary(thumbnailBuffer, uploadId);
            }

            await this.delay(3000, 6000);
            this.refreshCsrf();

            // 3. Configurar o post
            const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '.000';
            const configureData: Record<string, string> = {
                upload_id: uploadId,
                caption,
                source_type: '4',
                filter_type: '0',
                poster_frame_index: '0',
                length: String(videoInfo.durationMs / 1000),
                audio_muted: 'false',
                usertags: JSON.stringify({ in: [] }),
                date_time_original: nowStr,
                timezone_offset: '-10800',
                clips: JSON.stringify([{
                    length: videoInfo.durationMs / 1000,
                    source_type: '4',
                }]),
                extra: JSON.stringify({
                    source_width: videoInfo.width,
                    source_height: videoInfo.height,
                }),
            };

            const result = await this.apiPost('media/configure/?video=1', configureData);

            if (result?.status === 'ok') {
                const media = result.media || {};
                const code = media.code || '';
                const postUrl = `https://www.instagram.com/p/${code}/`;
                console.log(`[IG-Web] 📹 Vídeo publicado no feed! ${postUrl}`);
                return {
                    success: true,
                    mediaId: media.id || media.pk?.toString(),
                    mediaCode: code,
                    postUrl,
                };
            }

            console.error('[IG-Web] Configure vídeo feed falhou:', result);
            return { success: false, error: 'Falha ao configurar vídeo' };
        } catch (error: any) {
            console.error('[IG-Web] Erro no upload de vídeo:', error);
            return { success: false, error: error.message || 'Erro no upload' };
        }
    }

    // ── Publicar: Foto nos Stories ─────────────────────────────────────────

    async publishStoryPhoto(imageBuffer: Buffer, contentType = 'image/jpeg'): Promise<IGWebUploadResult> {
        if (!this.isAuthenticated) {
            return { success: false, error: 'Não autenticado' };
        }

        try {
            const uploadId = String(Date.now());

            if (!await this.uploadPhotoBinary(imageBuffer, uploadId, contentType)) {
                return { success: false, error: 'Falha no upload' };
            }

            await this.delay(2000, 4000);
            this.refreshCsrf();

            const now = Math.floor(Date.now() / 1000);
            const configureData: Record<string, string> = {
                upload_id: uploadId,
                source_type: '4',
                configure_mode: '1',
                timezone_offset: '-10800',
                client_shared_at: String(now - 5),
                client_timestamp: String(now),
                capture_type: 'normal',
                creation_surface: 'camera',
                camera_entry_point: '25',
                original_media_type: 'photo',
                has_original_sound: '1',
                camera_session_id: crypto.randomUUID(),
                composition_id: crypto.randomUUID(),
                filter_type: '0',
                _uid: this.userId || '',
                _uuid: crypto.randomUUID(),
            };

            const result = await this.apiPost('media/configure_to_story/', configureData);

            if (result?.status === 'ok') {
                const media = result.media || {};
                console.log('[IG-Web] 📱 Foto publicada nos Stories!');
                return {
                    success: true,
                    mediaId: media.id || media.pk?.toString(),
                };
            }

            return { success: false, error: 'Falha ao configurar story' };
        } catch (error: any) {
            console.error('[IG-Web] Erro no story (foto):', error);
            return { success: false, error: error.message || 'Erro no upload' };
        }
    }

    // ── Publicar: Reel ─────────────────────────────────────────────────────

    async publishReel(
        videoBuffer: Buffer,
        caption: string,
        thumbnailBuffer?: Buffer,
        videoInfo: { durationMs: number; width: number; height: number } = {
            durationMs: 15000, width: 1080, height: 1920,
        },
    ): Promise<IGWebUploadResult> {
        if (!this.isAuthenticated) {
            return { success: false, error: 'Não autenticado' };
        }

        try {
            const uploadId = String(Date.now());

            console.log(`[IG-Web] 🎬 Enviando Reel: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.durationMs / 1000}s`);

            // 1. Upload do vídeo (com flag is_clips_video)
            if (!await this.uploadVideoBinary(videoBuffer, uploadId, videoInfo, { isClips: true })) {
                return { success: false, error: 'Falha no upload do vídeo' };
            }

            // 2. Upload da thumbnail
            if (thumbnailBuffer) {
                await this.uploadPhotoBinary(thumbnailBuffer, uploadId);
            }

            await this.delay(3000, 6000);
            this.refreshCsrf();

            // 3. Configurar Reel
            const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + '.000';
            const configureData: Record<string, string> = {
                upload_id: uploadId,
                caption,
                source_type: '4',
                filter_type: '0',
                timezone_offset: '-10800',
                date_time_original: nowStr,
                clips_share_preview_to_feed: '1',
                length: String(videoInfo.durationMs / 1000),
                audio_muted: 'false',
                poster_frame_index: '70',
                usertags: JSON.stringify({ in: [] }),
                clips: JSON.stringify([{
                    length: videoInfo.durationMs / 1000,
                    source_type: '4',
                }]),
                extra: JSON.stringify({
                    source_width: videoInfo.width,
                    source_height: videoInfo.height,
                }),
            };

            const result = await this.apiPost('media/configure_to_clips/?video=1', configureData);

            if (result?.status === 'ok') {
                const media = result.media || {};
                const code = media.code || '';
                const postUrl = `https://www.instagram.com/reel/${code}/`;
                console.log(`[IG-Web] 🎬 Reel publicado! ${postUrl}`);
                return {
                    success: true,
                    mediaId: media.id || media.pk?.toString(),
                    mediaCode: code,
                    postUrl,
                };
            }

            return { success: false, error: 'Falha ao configurar Reel' };
        } catch (error: any) {
            console.error('[IG-Web] Erro no Reel:', error);
            return { success: false, error: error.message || 'Erro no upload' };
        }
    }

    // ── Interações sociais ─────────────────────────────────────────────────

    async likeMedia(mediaId: string): Promise<boolean> {
        try {
            const data = await this.webPost(`/web/likes/${mediaId}/like/`);
            return data?.status === 'ok';
        } catch (error) {
            console.error(`[IG-Web] Erro ao curtir ${mediaId}:`, error);
            return false;
        }
    }

    async commentMedia(mediaId: string, text: string): Promise<boolean> {
        try {
            const data = await this.webPost(`/web/comments/${mediaId}/add/`, {
                comment_text: text,
            });
            return data?.status === 'ok';
        } catch (error) {
            console.error(`[IG-Web] Erro ao comentar ${mediaId}:`, error);
            return false;
        }
    }

    async followUser(userId: number): Promise<boolean> {
        try {
            const data = await this.webPost(`/web/friendships/${userId}/follow/`);
            return data?.result === 'following' || data?.status === 'ok';
        } catch (error) {
            console.error(`[IG-Web] Erro ao seguir ${userId}:`, error);
            return false;
        }
    }

    async unfollowUser(userId: number): Promise<boolean> {
        try {
            const data = await this.webPost(`/web/friendships/${userId}/unfollow/`);
            return data?.status === 'ok';
        } catch (error) {
            console.error(`[IG-Web] Erro ao unfollow ${userId}:`, error);
            return false;
        }
    }

    // ── Hashtag Search (GraphQL) ───────────────────────────────────────────

    async hashtagMedias(hashtag: string, amount = 20): Promise<IGWebMedia[]> {
        try {
            const tag = hashtag.replace(/^#/, '').trim();
            const data = await this.apiGet(`tags/${tag}/`, {
                __a: '1',
                __d: 'dis',
            });

            // Fallback: tentar via GraphQL
            if (!data?.data && !data?.graphql) {
                // tentar endpoint web
                const response = await fetch(`${BASE_URL}/explore/tags/${tag}/?__a=1&__d=dis`, {
                    method: 'GET',
                    headers: this.getAjaxHeaders(),
                    ...this.getFetchOptions(),
                });

                if (!response.ok) return [];

                const setCookies = response.headers.getSetCookie?.() || [];
                this.parseCookies(setCookies);

                const webData = await response.json();
                const edges = webData?.graphql?.hashtag?.edge_hashtag_to_media?.edges
                    || webData?.data?.hashtag?.edge_hashtag_to_media?.edges
                    || [];

                return edges.slice(0, amount).map((edge: any) => {
                    const node = edge.node;
                    return {
                        pk: parseInt(node.id, 10),
                        id: node.id,
                        code: node.shortcode,
                        captionText: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                        likeCount: node.edge_liked_by?.count || 0,
                        commentCount: node.edge_media_to_comment?.count || 0,
                        mediaType: node.is_video ? 2 : 1,
                        imageUrl: node.display_url || '',
                        userId: node.owner?.id ? parseInt(node.owner.id, 10) : undefined,
                    } as IGWebMedia;
                });
            }

            const edges = data?.data?.top?.sections?.[0]?.layout_content?.medias
                || data?.graphql?.hashtag?.edge_hashtag_to_media?.edges
                || [];

            return edges.slice(0, amount).map((item: any) => {
                const media = item.media || item.node || item;
                return {
                    pk: parseInt(media.id || media.pk || '0', 10),
                    id: String(media.id || media.pk || ''),
                    code: media.code || media.shortcode || '',
                    captionText: media.caption?.text || media.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                    likeCount: media.like_count || media.edge_liked_by?.count || 0,
                    commentCount: media.comment_count || media.edge_media_to_comment?.count || 0,
                    mediaType: media.media_type || (media.is_video ? 2 : 1),
                    imageUrl: media.image_versions2?.candidates?.[0]?.url || media.display_url || '',
                    userId: media.user?.pk || media.owner?.id ? parseInt(String(media.user?.pk || media.owner?.id), 10) : undefined,
                } as IGWebMedia;
            });
        } catch (error) {
            console.error(`[IG-Web] Erro ao buscar #${hashtag}:`, error);
            return [];
        }
    }

    // ── User Medias (feed do perfil) ───────────────────────────────────────

    async getUserMedias(username: string, amount = 12): Promise<IGWebMedia[]> {
        try {
            const data = await this.apiGet('users/web_profile_info/', {
                username,
            });

            const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges || [];

            return edges.slice(0, amount).map((edge: any) => {
                const node = edge.node;
                return {
                    pk: parseInt(node.id, 10),
                    id: node.id,
                    code: node.shortcode,
                    captionText: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                    likeCount: node.edge_liked_by?.count || 0,
                    commentCount: node.edge_media_to_comment?.count || 0,
                    mediaType: node.is_video ? 2 : (node.__typename === 'GraphSidecar' ? 8 : 1),
                    takenAt: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000) : undefined,
                    imageUrl: node.display_url || '',
                    userId: node.owner?.id ? parseInt(node.owner.id, 10) : undefined,
                } as IGWebMedia;
            });
        } catch (error) {
            console.error(`[IG-Web] Erro ao buscar medias de @${username}:`, error);
            return [];
        }
    }

    // ── User ID from Username ──────────────────────────────────────────────

    async getUserIdFromUsername(username: string): Promise<number | null> {
        const info = await this.getUserInfo(username);
        return info?.pk || null;
    }

    // ── Logout ─────────────────────────────────────────────────────────────

    async logout(): Promise<void> {
        try {
            await this.webPost('/accounts/logout/ajax/', { one_tap_app_login: '0' });
        } catch {
            // Ignorar erros de logout
        }
        this.isAuthenticated = false;
        this.userId = null;
        this.username = null;
        this.cookies.clear();
    }
}

// ── Session Cache ──────────────────────────────────────────────────────────
// Mantém instâncias do InstagramWebAPI por userId para reutilizar sessões

const sessionCache: Map<string, { client: InstagramWebAPI; expiresAt: number }> = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutos

// Limpar sessões expiradas a cada 10 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessionCache.entries()) {
        if (value.expiresAt < now) {
            sessionCache.delete(key);
            console.log(`[IG-Web] Sessão expirada removida: ${key}`);
        }
    }
}, 10 * 60 * 1000);

// ── Funções exportadas (interface compatível com instagram-unofficial) ─────

/**
 * Faz login no Instagram via Web API.
 * Alternativa ao loginInstagramUnofficial que usa a API mobile.
 */
export async function loginInstagramWeb(
    credentials: IGWebCredentials,
): Promise<IGWebSession> {
    const api = new InstagramWebAPI();

    const loginOk = await api.login(credentials.username, credentials.password);
    if (!loginOk) {
        throw new Error('Falha no login via Web API');
    }

    // Buscar informações do perfil
    const userInfo = await api.getUserInfo(credentials.username);

    const session = api.getSessionData()!;
    session.profilePicUrl = userInfo?.profilePicUrl;
    session.fullName = userInfo?.fullName;
    session.followersCount = userInfo?.followerCount;
    session.followingCount = userInfo?.followingCount;
    session.mediaCount = userInfo?.mediaCount;

    // Cachear sessão
    const sessionKey = `igweb_${session.userId}`;
    sessionCache.set(sessionKey, {
        client: api,
        expiresAt: Date.now() + SESSION_TTL,
    });

    console.log(`[IG-Web] Login completo: @${credentials.username} (userId=${session.userId})`);
    return session;
}

/**
 * Restaura/obtém cliente autenticado a partir de um SocialToken.
 */
async function getOrRestoreWebClient(token: SocialToken): Promise<InstagramWebAPI> {
    const sessionKey = `igweb_${token.providerUserId}`;

    // Verificar cache
    const cached = sessionCache.get(sessionKey);
    if (cached && cached.expiresAt > Date.now()) {
        cached.expiresAt = Date.now() + SESSION_TTL;
        return cached.client;
    }

    // Restaurar de cookies
    const api = new InstagramWebAPI();

    if (token.metadata.igCookies) {
        try {
            const cookiesData = decrypt(token.metadata.igCookies as string);
            const cookies = JSON.parse(cookiesData);
            const session: IGWebSession = {
                username: token.providerUsername,
                userId: token.providerUserId,
                cookies,
                csrfToken: cookies.csrftoken || '',
            };

            const restored = await api.loadSession(session);
            if (restored) {
                sessionCache.set(sessionKey, {
                    client: api,
                    expiresAt: Date.now() + SESSION_TTL,
                });
                return api;
            }
        } catch (error) {
            console.warn(`[IG-Web] Erro ao restaurar cookies para @${token.providerUsername}:`, error);
        }
    }

    // Re-login se possível
    if (token.metadata.igPassword) {
        const password = decrypt(token.metadata.igPassword as string);
        const loginOk = await api.login(token.providerUsername, password);
        if (loginOk) {
            sessionCache.set(sessionKey, {
                client: api,
                expiresAt: Date.now() + SESSION_TTL,
            });
            return api;
        }
    }

    throw new Error('Não foi possível restaurar sessão Instagram (Web). Reconecte a conta.');
}

// ── Publicação via Web API ─────────────────────────────────────────────────

/**
 * Publica uma foto no feed do Instagram via Web API
 */
export async function publishInstagramPhotoWeb(
    token: SocialToken,
    imageBuffer: Buffer,
    caption: string,
): Promise<{ postId: string; postUrl: string }> {
    const api = await getOrRestoreWebClient(token);
    const result = await api.publishPhoto(imageBuffer, caption);

    if (!result.success) {
        throw new Error(result.error || 'Falha ao publicar foto');
    }

    return {
        postId: result.mediaId || '',
        postUrl: result.postUrl || '',
    };
}

/**
 * Publica um vídeo no feed do Instagram via Web API
 */
export async function publishInstagramVideoWeb(
    token: SocialToken,
    videoBuffer: Buffer,
    coverBuffer: Buffer | undefined,
    caption: string,
    videoInfo?: { durationMs: number; width: number; height: number },
): Promise<{ postId: string; postUrl: string }> {
    const api = await getOrRestoreWebClient(token);
    const result = await api.publishVideo(videoBuffer, caption, coverBuffer, videoInfo);

    if (!result.success) {
        throw new Error(result.error || 'Falha ao publicar vídeo');
    }

    return {
        postId: result.mediaId || '',
        postUrl: result.postUrl || '',
    };
}

/**
 * Publica uma foto como Story via Web API
 */
export async function publishInstagramStoryPhotoWeb(
    token: SocialToken,
    imageBuffer: Buffer,
): Promise<{ storyId: string }> {
    const api = await getOrRestoreWebClient(token);
    const result = await api.publishStoryPhoto(imageBuffer);

    if (!result.success) {
        throw new Error(result.error || 'Falha ao publicar story');
    }

    return { storyId: result.mediaId || '' };
}

/**
 * Publica um Reel via Web API
 */
export async function publishInstagramReelWeb(
    token: SocialToken,
    videoBuffer: Buffer,
    coverBuffer: Buffer | undefined,
    caption: string,
    videoInfo?: { durationMs: number; width: number; height: number },
): Promise<{ postId: string; postUrl: string }> {
    const api = await getOrRestoreWebClient(token);
    const result = await api.publishReel(videoBuffer, caption, coverBuffer, videoInfo);

    if (!result.success) {
        throw new Error(result.error || 'Falha ao publicar Reel');
    }

    return {
        postId: result.mediaId || '',
        postUrl: result.postUrl || '',
    };
}

/**
 * Obtém informações do perfil via Web API
 */
export async function getInstagramProfileInfoWeb(
    token: SocialToken,
): Promise<{
    followersCount: number;
    followingCount: number;
    mediaCount: number;
    fullName: string;
    biography: string;
    profilePicUrl: string;
}> {
    const api = await getOrRestoreWebClient(token);
    const userInfo = await api.getUserInfo(token.providerUsername);

    if (!userInfo) {
        throw new Error('Não foi possível obter informações do perfil');
    }

    return {
        followersCount: userInfo.followerCount,
        followingCount: userInfo.followingCount,
        mediaCount: userInfo.mediaCount,
        fullName: userInfo.fullName,
        biography: userInfo.biography || '',
        profilePicUrl: userInfo.profilePicUrl,
    };
}

/**
 * Valida se a sessão Web do Instagram ainda é válida
 */
export async function validateInstagramWebSession(token: SocialToken): Promise<boolean> {
    try {
        await getOrRestoreWebClient(token);
        return true;
    } catch {
        return false;
    }
}
