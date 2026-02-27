/**
 * Environment configuration for the Fuel Platform
 * Centralized configuration for API endpoints, timeouts, and other settings
 */

export const config = {
  // API Configuration
  api: {
    baseURL: import.meta.env.VITE_API_BASE_URL || '',
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000, // 1 second
  },

  // Authentication
  auth: {
    sessionTimeout: 3600000, // 1 hour in milliseconds
    refreshThreshold: 300000, // Refresh token 5 minutes before expiry
  },

  // Caching
  cache: {
    defaultStaleTime: 5 * 60 * 1000, // 5 minutes
    defaultCacheTime: 10 * 60 * 1000, // 10 minutes
  },

  // UI
  ui: {
    defaultPageSize: 20,
    maxPageSize: 100,
  },

  // Feature flags
  features: {
    enableCaching: true,
    enableErrorReporting: true,
    enableAnalytics: false,
  },
} as const;

export type Config = typeof config;
