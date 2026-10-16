/**
 * Centralized URL and Origin Configuration Helper for Quroxa Healthcare
 *
 * Provides deployment-independent URL resolution for:
 * - API requests (supporting relative '/api' or separate origins)
 * - Media and uploads (/uploads/...)
 * - WebSockets / Socket.IO
 * - Public frontend links and portals
 *
 * Evaluated without circular dependencies with HTTP or Socket clients.
 */

export const validateUrlConfig = (url, label = 'URL') => {
  if (!url || typeof url !== 'string') return;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn(`[CONFIG WARNING] ${label} "${trimmed}" has unsupported protocol "${parsed.protocol}". Expected http: or https:.`);
    }
  } catch (err) {
    console.error(`[CONFIG ERROR] Invalid ${label} configured: "${trimmed}". Provide a valid absolute URL or relative path.`);
  }
};

export const getRuntimeConfig = () => {
  if (typeof window !== 'undefined' && window.__QUROXA_CONFIG__) {
    return window.__QUROXA_CONFIG__;
  }
  return {};
};

export const getApiBaseUrl = () => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.apiUrl && typeof runtimeConfig.apiUrl === 'string' && runtimeConfig.apiUrl.trim()) {
    const trimmed = runtimeConfig.apiUrl.trim();
    validateUrlConfig(trimmed, 'Runtime apiUrl');
    return trimmed.replace(/\/+$/, '');
  }
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? String(import.meta.env.VITE_API_URL).trim()
    : '';
  if (envUrl) {
    validateUrlConfig(envUrl, 'VITE_API_URL');
    return envUrl.replace(/\/+$/, '');
  }
  return '/api';
};

export const getBackendBaseUrl = () => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.backendUrl && typeof runtimeConfig.backendUrl === 'string' && runtimeConfig.backendUrl.trim()) {
    const trimmed = runtimeConfig.backendUrl.trim();
    validateUrlConfig(trimmed, 'Runtime backendUrl');
    return trimmed.replace(/\/+$/, '');
  }
  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    return apiBase.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

export const getPublicFrontendUrl = () => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.publicAppUrl && typeof runtimeConfig.publicAppUrl === 'string' && runtimeConfig.publicAppUrl.trim()) {
    const trimmed = runtimeConfig.publicAppUrl.trim();
    validateUrlConfig(trimmed, 'Runtime publicAppUrl');
    return trimmed.replace(/\/+$/, '');
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) {
    const envApp = String(import.meta.env.VITE_APP_URL).trim();
    validateUrlConfig(envApp, 'VITE_APP_URL');
    return envApp.replace(/\/+$/, '');
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_URL) {
    const envPub = String(import.meta.env.VITE_PUBLIC_URL).trim();
    validateUrlConfig(envPub, 'VITE_PUBLIC_URL');
    return envPub.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

export const getApiUrl = (endpoint = '') => {
  const base = getApiBaseUrl();
  if (!endpoint) return base;
  if (typeof endpoint !== 'string') return endpoint;
  const trimmed = endpoint.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//') || trimmed.startsWith('data:')) return trimmed;
  const cleanEndpoint = trimmed.startsWith('/api') ? trimmed.slice(4) : trimmed;
  const baseClean = base.endsWith('/') ? base.slice(0, -1) : base;
  const pathClean = cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`;
  return `${baseClean}${pathClean}`;
};

export const resolveMediaUrl = (url) => {
  if (!url) return '';
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const backendBase = getBackendBaseUrl();
  const baseClean = backendBase.endsWith('/') ? backendBase.slice(0, -1) : backendBase;
  const pathClean = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${baseClean}${pathClean}`;
};

export const getSocketUrl = () => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.socketUrl && typeof runtimeConfig.socketUrl === 'string' && runtimeConfig.socketUrl.trim()) {
    const trimmed = runtimeConfig.socketUrl.trim().replace(/\/+$/, '');
    validateUrlConfig(trimmed, 'Runtime socketUrl');
    return trimmed;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL) {
    const envSock = String(import.meta.env.VITE_SOCKET_URL).trim().replace(/\/+$/, '');
    validateUrlConfig(envSock, 'VITE_SOCKET_URL');
    return envSock;
  }
  const backendBase = getBackendBaseUrl();
  if (backendBase) {
    return backendBase;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
};
