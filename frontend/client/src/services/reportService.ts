import { api } from '@/lib/api';

export const reportService = {
  // Generate Daily Movement Report
  async generateDailyMovement(params: {
    date: string;
    format: 'excel' | 'preview' | 'csv';
    assetIds?: string[];
  }) {
    const response = await api.post('/reports/generate-daily-movement', params);

    if (params.format === 'preview') {
      return response.data;
    } else {
      // Handle file download
      const blob = new Blob([response.data], {
        type: params.format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily_movement_${params.date}.${params.format === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true };
    }
  },

  // Generate Fuel/Temperature Report
  async generateFuelTemperature(params: {
    date: string;
    format: 'pdf' | 'preview';
    assetId?: string;
  }) {
    const response = await api.post('/reports/generate-fuel-temperature', params);

    if (params.format === 'preview') {
      return response.data;
    } else {
      // Handle PDF download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fuel_temperature_${params.date}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true };
    }
  },

  // Upload existing reports
  async uploadDailyMovement(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/reports/upload-daily-movement', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  },

  async uploadFuelTemperature(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/reports/upload-fuel-temperature', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  }
};