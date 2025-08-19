import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createLogger } from './logger';

const logger = createLogger('BackendClient');

interface ConnectionTest {
  status: 'connected' | 'error';
  baseURL: string;
  serverStatus?: any;
  error?: string;
}

interface UploadResult {
  success: boolean;
  dataId?: string;
  message?: string;
  filename?: string;
  error?: string;
}

interface AnalysisResult {
  success: boolean;
  analysisId?: string;
  status?: string;
  estimatedTime?: string;
  error?: string;
}

interface StatusResult {
  success: boolean;
  analysisId?: string;
  status?: string;
  progress?: number;
  results?: any;
  error?: string;
}

interface AnalysisTypes {
  success: boolean;
  types: string[];
  error?: string;
}

interface ProfileResult {
  success: boolean;
  profile?: {
    dataType: string;
    missingRate: number;
    timeInterval?: string;
    columnTypes: Record<string, string>;
  };
  error?: string;
}

/**
 * TypeScript client for toorpia backend API
 */
export class ToorpiaBackendClient {
  private baseURL: string;
  private apiKey?: string;
  private client: AxiosInstance;

  constructor() {
    this.baseURL = process.env.TOORPIA_API_URL || 'https://dev.toorpia.com/api';
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
      (response: AxiosResponse) => {
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
  async testConnection(): Promise<ConnectionTest> {
    try {
      const response = await this.client.get('/health');
      return {
        status: 'connected',
        baseURL: this.baseURL,
        serverStatus: response.data,
      };
    } catch (error: any) {
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
  async uploadData(csvData: string, filename: string = 'data.csv'): Promise<UploadResult> {
    try {
      const formData = new FormData();
      const blob = new Blob([csvData], { type: 'text/csv' });
      formData.append('file', blob, filename);

      const response = await this.client.post('/data/upload', formData, {
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
    } catch (error: any) {
      logger.error('Data upload failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get data profile for preprocessing suggestions
   */
  async getDataProfile(dataId: string): Promise<ProfileResult> {
    try {
      const response = await this.client.get(`/data/${dataId}/profile`);
      return {
        success: true,
        profile: response.data,
      };
    } catch (error: any) {
      logger.error('Data profiling failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Run analysis on preprocessed data using session
   */
  async runAnalysisWithSession(sessionId: string, processedUri: string, analysisType: string = 'clustering', parameters: Record<string, any> = {}): Promise<AnalysisResult> {
    try {
      const response = await this.client.post('/analysis/run', {
        sessionId,
        processedUri,
        analysisType,
        parameters,
      });

      return {
        success: true,
        analysisId: response.data.analysisId,
        status: response.data.status,
        estimatedTime: response.data.estimatedTime,
      };
    } catch (error: any) {
      logger.error('Analysis start failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Legacy method - Run analysis on uploaded data (deprecated)
   */
  async runAnalysis(dataId: string, analysisType: string = 'clustering', parameters: Record<string, any> = {}): Promise<AnalysisResult> {
    try {
      const response = await this.client.post('/analysis/run', {
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
    } catch (error: any) {
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
  async getAnalysisStatus(analysisId: string): Promise<StatusResult> {
    try {
      const response = await this.client.get(`/analysis/${analysisId}/status`);
      
      return {
        success: true,
        analysisId,
        status: response.data.status,
        progress: response.data.progress,
        results: response.data.results,
        error: response.data.error,
      };
    } catch (error: any) {
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
  async getAnalysisTypes(): Promise<AnalysisTypes> {
    try {
      const response = await this.client.get('/analysis/types');
      return {
        success: true,
        types: response.data.types,
      };
    } catch (error: any) {
      logger.error('Failed to get analysis types:', error);
      return {
        success: false,
        types: ['clustering', 'anomaly_detection'], // fallback
        error: error.message,
      };
    }
  }

  /**
   * Validate processed data manifest
   */
  async validateProcessedData(uri: string, checksum: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await this.client.post('/data/validate', {
        uri,
        checksum,
      });
      
      return {
        valid: response.data.valid,
      };
    } catch (error: any) {
      logger.error('Data validation failed:', error);
      return {
        valid: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }
}

export default ToorpiaBackendClient;
