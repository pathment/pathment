import axios, { AxiosInstance } from 'axios';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Create axios instance
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
});

// Request interceptor - add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Check if token expired
      const errorMessage = error.response?.data?.message || '';
      if (errorMessage.toLowerCase().includes('expired')) {
        // Token expired - try to refresh
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
        
        if (refreshToken) {
          try {
            const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
            const newToken = response.data?.data?.accessToken || response.data?.accessToken;
            
            if (newToken) {
              // Save new token
              localStorage.setItem('token', newToken);
              // Retry original request
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return axiosInstance(originalRequest);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
          }
        }

        // If refresh failed or no refresh token, clear auth and redirect
        handleAuthFailure();
      } else {
        // Invalid token or other 401 error
        handleAuthFailure();
      }
    }

    return Promise.reject(error);
  }
);

function handleAuthFailure() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    toast.error('Your session has expired. Please log in again.');
    
    setTimeout(() => {
      window.location.href = '/login?expired=true';
    }, 1500);
  }
}

export default axiosInstance;
