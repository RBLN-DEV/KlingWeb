// User Types
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Video Generation Types
export interface VideoGeneration {
  id: string;
  title: string;
  status: 'processing' | 'completed' | 'failed' | 'pending';
  thumbnailUrl?: string;
  videoUrl?: string;
  duration: number;
  createdAt: Date;
  updatedAt: Date;
  parameters: KlingParameters;
  imageUrl: string;
  referenceVideoUrl?: string;
}

export interface KlingParameters {
  duration: number;
  cfgScale: number;
  preserveStructure: boolean;
  identityConsistency: boolean;
  mode: 'standard' | 'professional';
}

// Image Generation Types
export interface ImageGeneration {
  id: string;
  prompt: string;
  imageUrl?: string;
  status: 'processing' | 'completed' | 'failed' | 'pending';
  createdAt: Date;
  model: string;
  aspectRatio: AspectRatio;
  quality: 'standard' | 'high' | 'ultra';
}

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

// Prompt Types
export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: PromptCategory;
  tags: string[];
  previewUrl?: string;
  isCustom?: boolean;
}

export type PromptCategory =
  | 'all'
  | 'portraits'
  | 'fashion'
  | 'sensual'
  | 'nature'
  | 'urban'
  | 'abstract'
  | 'custom';

// API Types
export interface ApiKeys {
  geminiApiKey: string;
  klingApiKey: string;
  klingSecret: string;
}

// Stats Types
export interface UserStats {
  totalVideos: number;
  totalImages: number;
  creditsRemaining: number;
  totalDuration: number;
  successRate: number;
}

// Navigation Types
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

// Form Types
export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

// Toast Types
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}
