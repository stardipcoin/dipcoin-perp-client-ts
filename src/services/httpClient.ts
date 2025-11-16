// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { ApiResponse } from "../types";

/**
 * HTTP Client for API requests
 */
export class HttpClient {
  private instance: AxiosInstance;
  private baseURL: string;
  private walletAddress?: string;
  private authToken?: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  /**
   * Check if URL is a perp-trade-api endpoint
   */
  private isPerpTradeApiUrl(url?: string): boolean {
    return url?.startsWith("/api/perp-trade-api") ?? false;
  }

  /**
   * Check if URL is a public endpoint (doesn't require auth)
   */
  private isPublicEndpoint(url?: string): boolean {
    return url?.includes("/public/") ?? false;
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Only add X-Wallet-Address and Authorization headers for /api/perp-trade-api endpoints
        // Match ts-frontend: only /api/perp-trade-api requests get these headers
        if (this.isPerpTradeApiUrl(config.url)) {
          // Add wallet address header if set
          // Match ts-frontend: always add X-Wallet-Address for perp-trade-api requests
          if (this.walletAddress && config.headers) {
            config.headers["X-Wallet-Address"] = this.walletAddress;
          }

          // Add authorization header if set and not a public endpoint
          // Match ts-frontend: don't add Authorization for /public/ endpoints
          if (this.authToken && config.headers && !this.isPublicEndpoint(config.url)) {
            config.headers["Authorization"] = `Bearer ${this.authToken}`;
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        // Return the response data directly
        return response.data as any;
      },
      (error) => {
        // Handle error responses
        const errorMessage =
          error.response?.data?.message || error.message || "Request failed";
        return Promise.reject(new Error(errorMessage));
      }
    );
  }

  /**
   * Set wallet address for requests
   */
  setWalletAddress(address: string): void {
    this.walletAddress = address;
  }

  /**
   * Set authorization token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get axios instance
   */
  getInstance(): AxiosInstance {
    return this.instance;
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.instance.get<ApiResponse<T>>(url, config) as unknown as Promise<ApiResponse<T>>;
  }

  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.instance.post<ApiResponse<T>>(url, data, config) as unknown as Promise<ApiResponse<T>>;
  }

  /**
   * POST form data request
   * Match ts-frontend: uses application/x-www-form-urlencoded for form data
   */
  async postForm<T = any>(
    url: string,
    data: Record<string, any>,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const formData = new URLSearchParams();
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value !== undefined && value !== null) {
        if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    // Merge headers: form data Content-Type takes precedence, but preserve other headers
    // Match ts-frontend: form requests use application/x-www-form-urlencoded
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...config?.headers,
    };

    return this.instance.post<ApiResponse<T>>(url, formData.toString(), {
      ...config,
      headers,
    }) as unknown as Promise<ApiResponse<T>>;
  }
}

