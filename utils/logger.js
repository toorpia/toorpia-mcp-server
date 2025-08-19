import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

// Log levels configuration
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Create winston logger configuration
const createLoggerConfig = (label) => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const verboseLogging = process.env.VERBOSE_LOGGING === 'true';

  const formats = [
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.label({ label }),
    winston.format.printf(({ timestamp, level, label, message, ...meta }) => {
      let logMessage = `${timestamp} [${label}] ${level.toUpperCase()}: ${message}`;
      
      if (verboseLogging && Object.keys(meta).length > 0) {
        logMessage += ` ${JSON.stringify(meta, null, 2)}`;
      }
      
      return logMessage;
    }),
  ];

  if (verboseLogging) {
    formats.unshift(winston.format.colorize());
  }

  const transports = [
    new winston.transports.Console({
      level: logLevel,
      format: winston.format.combine(...formats),
    }),
  ];

  // Add file logging in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.label({ label }),
          winston.format.json()
        ),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        level: logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.label({ label }),
          winston.format.json()
        ),
      })
    );
  }

  return {
    level: logLevel,
    levels: logLevels,
    format: winston.format.combine(...formats),
    transports,
    exitOnError: false,
  };
};

// Logger cache to reuse loggers with the same label
const loggerCache = new Map();

/**
 * Create or retrieve a cached logger instance
 * @param {string} label - Logger label (usually module name)
 * @returns {winston.Logger} Winston logger instance
 */
export const createLogger = (label) => {
  if (loggerCache.has(label)) {
    return loggerCache.get(label);
  }

  const logger = winston.createLogger(createLoggerConfig(label));
  loggerCache.set(label, logger);
  
  return logger;
};

/**
 * Get the default logger
 * @returns {winston.Logger} Default logger instance
 */
export const getDefaultLogger = () => {
  return createLogger('Default');
};

/**
 * Create a child logger with additional context
 * @param {winston.Logger} parentLogger - Parent logger
 * @param {object} context - Additional context to include in logs
 * @returns {winston.Logger} Child logger with context
 */
export const createChildLogger = (parentLogger, context) => {
  return parentLogger.child(context);
};

/**
 * Configure logger for specific environments
 * @param {string} environment - Environment (development, production, test)
 */
export const configureForEnvironment = (environment) => {
  switch (environment) {
    case 'test':
      // Minimize logging during tests
      winston.configure({
        level: 'error',
        silent: true,
      });
      break;
    case 'development':
      // Enable verbose logging in development
      process.env.VERBOSE_LOGGING = 'true';
      process.env.LOG_LEVEL = 'debug';
      break;
    case 'production':
      // Structured logging for production
      process.env.VERBOSE_LOGGING = 'false';
      process.env.LOG_LEVEL = 'info';
      process.env.ENABLE_FILE_LOGGING = 'true';
      break;
  }
};

// Export default logger for convenience
export default createLogger('MCPServer');
