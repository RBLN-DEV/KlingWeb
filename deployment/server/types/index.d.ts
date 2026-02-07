export interface KlingConfig {
    accessKey: string;
    secretKey: string;
    baseUrl: string;
    maxRetries: number;
    retryDelay: number;
    pollInterval: number;
}
export interface GenerationConfig {
    duration: 5 | 10;
    aspectRatio: '16:9' | '9:16' | '1:1';
    mode: 'std' | 'pro';
    cfgScale: number;
}
export interface VideoGenerationRequest {
    imageUrl?: string;
    imageBase64?: string;
    referenceVideoUrl?: string;
    prompt?: string;
    negativePrompt?: string;
    config?: Partial<GenerationConfig>;
    title: string;
}
export interface VideoGenerationResponse {
    id: string;
    taskId: string;
    title: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    statusMessage: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    createdAt: Date;
    updatedAt: Date;
    error?: string;
}
export interface TaskStatusResponse {
    taskId: string;
    status: 'pending' | 'processing' | 'succeed' | 'failed';
    progress: number;
    videoUrl?: string;
    error?: string;
}
export interface ImageGenerationRequest {
    prompt: string;
    model?: 'gemini' | 'azure-dalle';
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
    quality?: 'standard' | 'high' | 'ultra';
}
export interface ImageGenerationResponse {
    id: string;
    prompt: string;
    imageUrl: string;
    imageBase64?: string;
    status: 'completed' | 'failed';
    model: string;
    createdAt: Date;
    error?: string;
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface KlingCreateTaskResponse {
    code: number;
    message: string;
    request_id: string;
    data: {
        task_id: string;
        task_status?: string;
    };
}
export interface KlingTaskStatusData {
    task_id: string;
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_progress?: number;
    task_result?: {
        videos?: Array<{
            id: string;
            url: string;
            duration: number;
        }>;
    };
}
export interface KlingTaskStatusResponse {
    code: number;
    message: string;
    request_id: string;
    data: KlingTaskStatusData;
}
//# sourceMappingURL=index.d.ts.map