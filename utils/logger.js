const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || 'debug'
    })
  );
}

// File transports
transports.push(
  // Error log file
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Combined log file
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Access log file
  new DailyRotateFile({
    filename: path.join(logsDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'maydiv-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports,
  exitOnError: false
});

// Handle uncaught exceptions
logger.exceptions.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  })
);

// Handle unhandled promise rejections
logger.rejections.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  })
);

// Custom logging methods
const customLogger = {
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  
  error: (message, meta = {}) => {
    logger.error(message, meta);
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  
  // Log API requests
  request: (req, res, responseTime) => {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || 'anonymous'
    };
    
    if (res.statusCode >= 400) {
      logger.warn('API Request', logData);
    } else {
      logger.info('API Request', logData);
    }
  },
  
  // Log database operations
  database: (operation, collection, duration, meta = {}) => {
    logger.info('Database Operation', {
      operation,
      collection,
      duration: `${duration}ms`,
      ...meta
    });
  },
  
  // Log authentication events
  auth: (event, userId, meta = {}) => {
    logger.info('Authentication Event', {
      event,
      userId,
      ...meta
    });
  },
  
  // Log security events
  security: (event, meta = {}) => {
    logger.warn('Security Event', {
      event,
      ...meta
    });
  },
  
  // Log business events
  business: (event, meta = {}) => {
    logger.info('Business Event', {
      event,
      ...meta
    });
  },
  
  // Log performance metrics
  performance: (metric, value, meta = {}) => {
    logger.info('Performance Metric', {
      metric,
      value,
      ...meta
    });
  },
  
  // Log errors with context
  errorWithContext: (error, context = {}) => {
    logger.error('Application Error', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context
    });
  }
};

// Stream for Morgan HTTP logging
customLogger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = customLogger; 