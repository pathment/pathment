import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { apiConfig } from '../config/api';
import { normalizeAxiosError } from '../utils/api-error';

class ApiClient {
  private client: AxiosInstance;
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

        // Handle 401 Unauthorized - try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry && hasAccessToken && !isPublicAuthRequest) {
          originalRequest._retry = true;

          try {
            const refreshToken = this.getRefreshToken();
            if (!refreshToken) {
              // No refresh token, clear and redirect
              this.handleAuthFailure('Session expired. Please log in again.');
              return Promise.reject(error);
            }

            // Try to refresh the token
            const response = await axios.post(
              `${apiConfig.baseUrl}${apiConfig.endpoints.refreshToken}`,
              { refreshToken },
              { headers: { 'Content-Type': 'application/json' } }
            );
            
            // Extract new token from response
            const newToken = response.data?.data?.accessToken || response.data?.accessToken || response.data?.data?.token || response.data?.token;
            if (!newToken) {
              console.error('Refresh response:', response.data);
              throw new Error('No token in refresh response');
            }

            // Save new token and retry original request
            this.setToken(newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, clear tokens and redirect
            console.error('Token refresh failed:', refreshError);
            this.handleAuthFailure('Your session has expired. Redirecting to login...');
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private handleAuthFailure(message: string): void {
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
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  }

  private getRefreshToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('refreshToken');
    }
    return null;
  }

  private setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  private clearTokens(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
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
