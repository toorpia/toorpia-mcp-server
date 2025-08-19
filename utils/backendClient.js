import axios from 'axios';
import { createLogger } from './logger.js';

const logger = createLogger('BackendClient');

/**
 * Simple client for toorpia backend API
 */
export class ToorpiaBackendClient {
  constructor() {
    this.baseURL = process.env.TOORPIA_API_URL || 'http://localhost:3000';
    this.apiKey = process.env.TOORPIA_API_KEY;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add API key to headers if available
    if (this.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Request/Response interceptors for logging
    this.client.interceptors.request.use((config) => {
      logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error(`API Error: ${error.response?.status} ${error.config?.url}`, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const response = await this.client.get('/api/health');
      return {
        status: 'connected',
        baseURL: this.baseURL,
        serverStatus: response.data,
      };
    } catch (error) {
      return {
        status: 'error',
        baseURL: this.baseURL,
        error: error.message,
      };
    }
  }

  /**
   * Upload CSV data to toorpia backend
   */
  async uploadData(csvData, filename = 'data.csv') {
    try {
      const formData = new FormData();
      const blob = new Blob([csvData], { type: 'text/csv' });
      formData.append('file', blob, filename);

      const response = await this.client.post('/api/data/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return {
        success: true,
        dataId: response.data.id,
        message: response.data.message,
        filename,
      };
    } catch (error) {
      logger.error('Data upload failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Run analysis on uploaded data
   */
  async runAnalysis(dataId, analysisType = 'clustering', parameters = {}) {
    try {
      const response = await this.client.post('/api/analysis/run', {
        dataId,
        analysisType,
        parameters,
      });

      return {
        success: true,
        analysisId: response.data.analysisId,
        status: response.data.status,
        estimatedTime: response.data.estimatedTime,
      };
    } catch (error) {
      logger.error('Analysis start failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get analysis status and results
   */
  async getAnalysisStatus(analysisId) {
    try {
      const response = await this.client.get(`/api/analysis/${analysisId}/status`);
      
      return {
        success: true,
        analysisId,
        status: response.data.status,
        progress: response.data.progress,
        results: response.data.results,
        error: response.data.error,
      };
    } catch (error) {
      logger.error('Status check failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get list of available analysis types
   */
  async getAnalysisTypes() {
    try {
      const response = await this.client.get('/api/analysis/types');
      return {
        success: true,
        types: response.data.types,
      };
    } catch (error) {
      logger.error('Failed to get analysis types:', error);
      return {
        success: false,
        types: ['clustering', 'anomaly_detection'], // fallback
        error: error.message,
      };
    }
  }
}

export default ToorpiaBackendClient;
