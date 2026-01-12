import { apiRequest } from "./queryClient";

export const api = {
  get: (url: string) => apiRequest("GET", `http://localhost:5000${url}`),
  post: (url: string, data?: any) => apiRequest("POST", `http://localhost:5000${url}`, data),
  put: (url: string, data?: any) => apiRequest("PUT", `http://localhost:5000${url}`, data),
  delete: (url: string) => apiRequest("DELETE", `http://localhost:5000${url}`),
};