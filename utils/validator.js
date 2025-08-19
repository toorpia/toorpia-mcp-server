import { createLogger } from './logger.js';

const logger = createLogger('Validator');

/**
 * Simple validation utilities for MCP server
 */
export class Validator {
  /**
   * Validate that required fields are present in data
   */
  static validateRequired(data, requiredFields) {
    const missing = [];
    
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    return true;
  }

  /**
   * Validate CSV data format
   */
  static validateCSV(csvData) {
    if (typeof csvData !== 'string') {
      throw new Error('CSV data must be a string');
    }
    
    if (csvData.trim().length === 0) {
      throw new Error('CSV data cannot be empty');
    }
    
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }
    
    // Basic format check
    const headerCols = lines[0].split(',').length;
    if (headerCols < 2) {
      throw new Error('CSV must have at least 2 columns');
    }
    
    return true;
  }

  /**
   * Validate analysis type
   */
  static validateAnalysisType(type) {
    const validTypes = ['clustering', 'anomaly_detection'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid analysis type. Must be one of: ${validTypes.join(', ')}`);
    }
    return true;
  }

  /**
   * Validate feedback data
   */
  static validateFeedback(feedback) {
    const requiredFields = ['feedback_type', 'title', 'description'];
    this.validateRequired(feedback, requiredFields);
    
    const validTypes = ['bug_report', 'feature_request', 'usage_experience', 'performance_issue'];
    if (!validTypes.includes(feedback.feedback_type)) {
      throw new Error(`Invalid feedback type. Must be one of: ${validTypes.join(', ')}`);
    }
    
    if (feedback.rating && (feedback.rating < 1 || feedback.rating > 5)) {
      throw new Error('Rating must be between 1 and 5');
    }
    
    return true;
  }

  /**
   * Sanitize string to prevent basic issues
   */
  static sanitizeString(str, maxLength = 1000) {
    if (typeof str !== 'string') {
      return String(str);
    }
    
    return str.trim().substring(0, maxLength);
  }
}

export default Validator;
