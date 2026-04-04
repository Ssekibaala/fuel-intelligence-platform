import { getAuthToken } from "@/lib/authToken";
import { config } from "@/lib/config";

const buildAuthHeaders = () => {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

export const reportService = {
  async generateDailyMovement(params: {
    date: string;
    endDate?: string;
    format: "pdf" | "excel" | "preview" | "csv";
    vehicleId?: string;
    vehicleIds?: string[];
  }) {
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
    const url = new URL(`${baseUrl}/api/reports/generate`);
    url.searchParams.set("format", params.format);
    url.searchParams.set("start_date", params.date);
    url.searchParams.set("report_type", "daily-movement");
    if (params.endDate) {
      url.searchParams.set("end_date", params.endDate);
    }
    if (params.vehicleId) {
      url.searchParams.set("vehicle_id", params.vehicleId);
    }
    if (params.vehicleIds && params.vehicleIds.length > 0) {
      url.searchParams.set("vehicle_ids", params.vehicleIds.join(","));
    }
    const response = await fetch(url, {
      method: "GET",
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate report: ${response.status}`);
    }

    if (params.format === "preview") {
      return response.json();
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    const safeEndDate = params.endDate || params.date;
    const rangeLabel = safeEndDate === params.date ? params.date : `${params.date}_${safeEndDate}`;
    const extension =
      params.format === "excel" ? "xlsx" : params.format === "pdf" ? "pdf" : "csv";
    link.download = `daily_movement_${rangeLabel}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  },

  async generateFuelTemperature(params: {
    date: string;
    endDate?: string;
    format: "pdf" | "preview" | "csv" | "excel";
    vehicleId?: string;
    vehicleIds?: string[];
  }) {
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
    const url = new URL(`${baseUrl}/api/reports/generate`);
    url.searchParams.set("format", params.format === "preview" ? "preview" : params.format);
    url.searchParams.set("start_date", params.date);
    url.searchParams.set("report_type", "fuel-temperature");
    if (params.endDate) {
      url.searchParams.set("end_date", params.endDate);
    }
    if (params.vehicleId) {
      url.searchParams.set("vehicle_id", params.vehicleId);
    }
    if (params.vehicleIds && params.vehicleIds.length > 0) {
      url.searchParams.set("vehicle_ids", params.vehicleIds.join(","));
    }
    const response = await fetch(url, {
      method: "GET",
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate report: ${response.status}`);
    }

    if (params.format === "preview") {
      return response.json();
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    const safeEndDate = params.endDate || params.date;
    const rangeLabel = safeEndDate === params.date ? params.date : `${params.date}_${safeEndDate}`;
    const extension = params.format === "csv" ? "csv" : params.format === "excel" ? "xlsx" : "pdf";
    link.download = `fuel_temperature_${rangeLabel}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  },
};
