import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { apiConfig } from '../config/api';
import { normalizeAxiosError } from '../utils/api-error';
import { tokenStore } from './token-store';

class ApiClient {
  private client: AxiosInstance;
  // Single-flight refresh: when the access token expires, a page fires many
  // requests that all 401 at once. Without this they each POST /auth/refresh —
  // a dozen concurrent refreshes that hammer the 10/hour limiter (some get 429'd
  // and log the user out mid-session). We coalesce them into ONE refresh and let
  // every waiter reuse its result.
  private refreshPromise: Promise<string> | null = null;
  // Guard so a burst of failures triggers ONE logout/redirect, not a dozen.
  private authFailing = false;
  private readonly publicAuthPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/verify-2fa-login',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/auth/resend-verification',
    '/auth/validate-invite',
    '/public/',
  ];

  constructor() {
    this.client = axios.create({
      baseURL: apiConfig.baseUrl,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // For multipart uploads, DROP the default 'application/json' content-type
        // so axios sets 'multipart/form-data; boundary=…' itself. Forcing JSON
        // strips the boundary, the server parses zero files, and every upload
        // fails with "No image uploaded" / "Could not upload image".
        if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
          delete config.headers['Content-Type'];
          delete config.headers['content-type'];
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        normalizeAxiosError(error);
        const originalRequest = error.config;
        const requestUrl = String(originalRequest?.url || '').toLowerCase();
        const hasAccessToken = Boolean(this.getToken());
        const isPublicAuthRequest = this.publicAuthPaths.some((path) => requestUrl.includes(path));

        // Handle 401 Unauthorized - try to refresh token (single-flight)
        if (error.response?.status === 401 && !originalRequest._retry && hasAccessToken && !isPublicAuthRequest) {
          originalRequest._retry = true;
          try {
            const newToken = await this.refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            this.handleAuthFailure('Your session has expired. Redirecting to login...');
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Refresh the access token, at most ONE request in flight at a time. Every
   * caller that arrives while a refresh is running awaits the same promise, so a
   * burst of 401s produces a single /auth/refresh — not a dozen.
   */
  private refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return Promise.reject(new Error('No refresh token'));

    this.refreshPromise = axios
      .post(
        `${apiConfig.baseUrl}${apiConfig.endpoints.refreshToken}`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      )
      .then((response) => {
        const newToken = response.data?.data?.accessToken || response.data?.accessToken || response.data?.data?.token || response.data?.token;
        if (!newToken) throw new Error('No token in refresh response');
        this.setToken(newToken);
        return newToken as string;
      })
      .finally(() => { this.refreshPromise = null; });

    return this.refreshPromise;
  }

  private handleAuthFailure(message: string): void {
    // A single expiry 401s many requests; only the first should log out + redirect.
    if (this.authFailing) return;
    this.authFailing = true;
    this.clearTokens();
    if (typeof window !== 'undefined') {
      // Show toast notification if available
      if ((window as any).toast?.error) {
        (window as any).toast.error(message);
      }
      
      // Redirect after a short delay to allow toast to show
      setTimeout(() => {
        window.location.href = '/login?expired=true';
      }, 1500);
    }
  }

  private getToken(): string | null {
    return tokenStore.getToken();
  }

  private getRefreshToken(): string | null {
    return tokenStore.getRefreshToken();
  }

  private setToken(token: string): void {
    tokenStore.setToken(token);
  }

  private clearTokens(): void {
    tokenStore.clearSession();
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.patch(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
