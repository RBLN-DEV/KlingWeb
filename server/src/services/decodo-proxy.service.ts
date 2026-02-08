// ============================================================================
// Decodo Proxy API Service — Consulta estatísticas e gerenciamento completo
// API Docs: https://help.decodo.com/reference/public-api-key-authentication
// Auth: Header "Authorization: <raw_api_key>" (sem prefixo Token/Bearer)
// ============================================================================

const DECODO_API_BASE = 'https://api.decodo.com';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface DecodoSubscription {
    traffic_limit: string;          // em GB
    traffic: string;                // GB usados
    proxy_users_limit: number;
    ip_address_limit: number;
    valid_from: string;             // YYYY-MM-DD
    valid_until: string;            // YYYY-MM-DD
    service_type: string;           // 'residential_proxies'
}

export interface DecodoSubUser {
    id: number;
    username: string;
    traffic_count_from: string | null;
    status: string;
    created_at: string;
    traffic: number;
    traffic_limit: number | null;
    service_type: string;
    auto_disable: boolean;
    uuid: string;
    usage_limit: number | null;
    traffic_bytes: number;
    traffic_limit_bytes: number | null;
}

export interface DecodoEndpoint {
    type: string;
    available_locations: string;
    url: string;
}

export interface DecodoTrafficDataPoint {
    key: string;
    rx_bytes: number;
    tx_bytes: number;
    rx_tx_bytes: number;
    requests: number;
}

export interface DecodoTrafficTotals {
    total_rx: number;
    total_tx: number;
    total_rx_tx: number;
    requests: number;
    unsuccessful_requests: number;
    response_time: number;
    success_rate: number;
}

export interface DecodoTrafficResponse {
    metadata: {
        total_items: number;
        total_pages: number;
        current_page: number;
        sort_by: string;
        sort_order: string;
        totals: DecodoTrafficTotals;
        limit: number;
    };
    data: DecodoTrafficDataPoint[];
}

export interface DecodoWhitelistedIp {
    ip: string;
    created_at?: string;
}

export interface DecodoOverview {
    subscription: DecodoSubscription | null;
    subUsers: DecodoSubUser[];
    endpoints: DecodoEndpoint[];
    traffic: DecodoTrafficResponse | null;
    trafficPeriod: string;
}

export interface BackConnectParams {
    username: string;
    password: string;
    session_type?: 'sticky' | 'random';
    session_time?: number;
    country?: string;
    state?: string;
    city?: string;
    output_format?: 'protocol:auth@endpoint' | 'endpoint:auth' | 'auth@endpoint';
    count?: number;
    page?: number;
    response_format?: 'json' | 'txt' | 'html';
    domain?: string;
    ip?: string;
    protocol?: 'http' | 'https';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
    return d.toISOString().slice(0, 10) + ' 00:00:00';
}

async function decodoFetch<T>(apiKey: string, url: string, method = 'GET', body?: Record<string, unknown>): Promise<T | null> {
    try {
        const opts: RequestInit = {
            method,
            headers: {
                'accept': 'application/json',
                'Authorization': apiKey,
            },
        };
        if (body) {
            opts.headers = { ...opts.headers as Record<string, string>, 'content-type': 'application/json' };
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(`${DECODO_API_BASE}${url}`, opts);
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(`[Decodo] ${method} ${url} → HTTP ${res.status}: ${errText}`);
            return null;
        }
        return await res.json() as T;
    } catch (err: any) {
        console.error(`[Decodo] Erro em ${method} ${url}:`, err.message);
        return null;
    }
}

async function decodoGet<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T | null> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return decodoFetch<T>(apiKey, path + qs, 'GET');
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export async function getSubscriptions(apiKey: string): Promise<DecodoSubscription[]> {
    return (await decodoFetch<DecodoSubscription[]>(apiKey, '/v2/subscriptions')) || [];
}

// ── Sub Users ────────────────────────────────────────────────────────────────

export async function getSubUsers(apiKey: string): Promise<DecodoSubUser[]> {
    return (await decodoGet<DecodoSubUser[]>(apiKey, '/v2/sub-users', { service_type: 'residential_proxies' })) || [];
}

export async function getSubUser(apiKey: string, subUserId: string | number): Promise<DecodoSubUser | null> {
    return decodoGet<DecodoSubUser>(apiKey, `/v2/sub-users/${subUserId}`);
}

export async function createSubUser(apiKey: string, body: {
    username: string;
    password: string;
    traffic_limit?: number;
    auto_disable?: boolean;
    service_type?: string;
}): Promise<unknown> {
    return decodoFetch(apiKey, '/v2/sub-users', 'POST', body as unknown as Record<string, unknown>);
}

export async function updateSubUser(apiKey: string, subUserId: string | number, body: {
    password?: string;
    traffic_limit?: number | null;
    auto_disable?: boolean;
}): Promise<unknown> {
    return decodoFetch(apiKey, `/v2/sub-users/${subUserId}`, 'PUT', body as unknown as Record<string, unknown>);
}

export async function deleteSubUser(apiKey: string, subUserId: string | number): Promise<boolean> {
    try {
        const res = await fetch(`${DECODO_API_BASE}/v2/sub-users/${subUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': apiKey },
        });
        return res.status === 204;
    } catch { return false; }
}

export async function getSubUserTraffic(
    apiKey: string, subUserId: number | string,
    type: '24h' | '7days' | 'month' | 'custom' = 'month',
    from?: string, to?: string,
): Promise<unknown> {
    const params: Record<string, string> = { type, service_type: 'residential_proxies' };
    if (type === 'custom' && from) params.from = from;
    if (type === 'custom' && to) params.to = to;
    return decodoGet<unknown>(apiKey, `/v2/sub-users/${subUserId}/traffic`, params);
}

export async function getAllocatedSubUserTraffic(apiKey: string): Promise<unknown> {
    return decodoGet<unknown>(apiKey, '/v2/sub-users/allocated-traffic', { service_type: 'residential_proxies' });
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export async function getEndpoints(apiKey: string): Promise<DecodoEndpoint[]> {
    return (await decodoFetch<DecodoEndpoint[]>(apiKey, '/v2/endpoints')) || [];
}

export async function getEndpointsByType(apiKey: string, type: 'random' | 'sticky'): Promise<unknown> {
    return decodoGet<unknown>(apiKey, `/v2/endpoints/${type}`);
}

/**
 * Gerar endpoints back-connect customizados.
 * @see https://help.decodo.com/reference/generate-custom-back-connect-endpoints
 */
export async function generateCustomBackConnectEndpoints(
    apiKey: string,
    params: BackConnectParams,
): Promise<unknown> {
    const qs: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
        if (v != null) qs[k] = String(v);
    }
    return decodoGet<unknown>(apiKey, '/v2/endpoints-custom/back-connect', qs);
}

/**
 * Gerar endpoints customizados (não back-connect).
 * @see https://help.decodo.com/reference/generate-custom-endpoints
 */
export async function generateCustomEndpoints(
    apiKey: string,
    params: Partial<BackConnectParams>,
): Promise<unknown> {
    const qs: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
        if (v != null) qs[k] = String(v);
    }
    return decodoGet<unknown>(apiKey, '/v2/endpoints-custom', qs);
}

// ── Whitelisted IPs ──────────────────────────────────────────────────────────

export async function getWhitelistedIps(apiKey: string): Promise<DecodoWhitelistedIp[]> {
    return (await decodoFetch<DecodoWhitelistedIp[]>(apiKey, '/v2/whitelisted-ips')) || [];
}

export async function addWhitelistedIps(apiKey: string, ips: string[]): Promise<unknown> {
    return decodoFetch(apiKey, '/v2/whitelisted-ips', 'POST', { ips });
}

export async function deleteWhitelistedIp(apiKey: string, ipId: string): Promise<boolean> {
    try {
        const res = await fetch(`${DECODO_API_BASE}/v2/whitelisted-ips/${ipId}`, {
            method: 'DELETE',
            headers: { 'Authorization': apiKey },
        });
        return res.status === 204;
    } catch { return false; }
}

// ── Statistics (api/v2/statistics) ───────────────────────────────────────────

export async function getTraffic(
    apiKey: string,
    days = 30,
    groupBy: 'day' | 'hour' | 'target' | 'country' | 'proxy_user' = 'day',
): Promise<DecodoTrafficResponse | null> {
    const now = new Date();
    const ago = new Date(now.getTime() - days * 86400000);
    return decodoFetch<DecodoTrafficResponse>(apiKey, '/api/v2/statistics/traffic', 'POST', {
        proxyType: 'residential_proxies',
        startDate: formatDate(ago),
        endDate: formatDate(now),
        groupBy,
        limit: 500,
        page: 1,
        sortBy: 'grouping_key',
        sortOrder: 'asc',
    });
}

export async function getTargets(apiKey: string, days = 30, search?: string): Promise<unknown> {
    const now = new Date();
    const ago = new Date(now.getTime() - days * 86400000);
    const body: Record<string, unknown> = {
        proxyType: 'residential_proxies',
        startDate: formatDate(ago),
        endDate: formatDate(now),
    };
    if (search) body.search = search;
    return decodoFetch(apiKey, '/api/v2/statistics/targets', 'POST', body);
}

// ── Overview (agregação para dashboard) ──────────────────────────────────────

export async function getProxyOverview(apiKey: string, trafficDays = 30): Promise<DecodoOverview> {
    const [subscription, subUsers, endpoints, traffic] = await Promise.all([
        getSubscriptions(apiKey).then(s => s[0] || null),
        getSubUsers(apiKey),
        getEndpoints(apiKey),
        getTraffic(apiKey, trafficDays, 'day'),
    ]);
    return { subscription, subUsers, endpoints, traffic, trafficPeriod: `${trafficDays}d` };
}
