/**
 * TypeScript logging patterns for clean code organization
 */

// 1. Logger factory with environment-based configuration
interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'simple' | 'json';
  destination: 'console' | 'file' | 'both';
}

class Logger {
  private config: LogConfig;
  
  constructor(config: LogConfig) {
    this.config = config;
  }
  
  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.config.level);
  }
  
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    
    if (this.config.format === 'json') {
      return JSON.stringify({ timestamp, level, message, ...meta });
    }
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  }
  
  debug(message: string, meta?: any) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }
  
  info(message: string, meta?: any) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }
  
  warn(message: string, meta?: any) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }
  
  error(message: string, meta?: any) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }
}

// 2. Method decorator for automatic logging
function LogMethod(options: { 
  includeArgs?: boolean; 
  includeResult?: boolean; 
  level?: 'debug' | 'info' 
} = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const { includeArgs = false, includeResult = false, level = 'info' } = options;
    
    descriptor.value = function (...args: any[]) {
      const logger = (this as any).logger || new Logger({ 
        level: 'debug', 
        format: 'simple', 
        destination: 'console' 
      });
      
      const startTime = Date.now();
      
      // Log method entry
      let logMessage = `Calling ${propertyKey}`;
      if (includeArgs) {
        logMessage += ` with args: ${JSON.stringify(args)}`;
      }
      logger[level](logMessage);
      
      try {
        const result = originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        
        // Handle async results
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              let successMessage = `${propertyKey} completed in ${duration}ms`;
              if (includeResult) {
                successMessage += ` -> ${JSON.stringify(value)}`;
              }
              logger[level](successMessage);
              return value;
            },
            (error) => {
              logger.error(`${propertyKey} failed after ${duration}ms: ${error.message}`);
              throw error;
            }
          );
        } else {
          // Synchronous result
          let successMessage = `${propertyKey} completed in ${duration}ms`;
          if (includeResult) {
            successMessage += ` -> ${JSON.stringify(result)}`;
          }
          logger[level](successMessage);
          return result;
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`${propertyKey} failed after ${duration}ms: ${(error as Error).message}`);
        throw error;
      }
    };
    
    return descriptor;
  };
}

// 3. Class decorator for API services
function LogApiCalls(target: any) {
  const originalMethods = Object.getOwnPropertyNames(target.prototype)
    .filter(name => name !== 'constructor' && typeof target.prototype[name] === 'function');
  
  originalMethods.forEach(methodName => {
    const originalMethod = target.prototype[methodName];
    
    target.prototype[methodName] = function (...args: any[]) {
      const logger = this.logger || new Logger({ 
        level: 'debug', 
        format: 'simple', 
        destination: 'console' 
      });
      
      logger.debug(`API call: ${methodName}`);
      
      try {
        const result = originalMethod.apply(this, args);
        
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              logger.debug(`API success: ${methodName}`);
              return value;
            },
            (error) => {
              logger.warn(`API error: ${methodName} - ${error.message}`);
              throw error;
            }
          );
        } else {
          logger.debug(`API success: ${methodName}`);
          return result;
        }
      } catch (error) {
        logger.warn(`API error: ${methodName} - ${(error as Error).message}`);
        throw error;
      }
    };
  });
  
  return target;
}

// 4. Usage examples
@LogApiCalls
class UserService {
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger({
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
      format: process.env.NODE_ENV === 'production' ? 'json' : 'simple',
      destination: 'console'
    });
  }
  
  @LogMethod({ includeArgs: true, level: 'debug' })
  async getUser(id: string) {
    // Business logic without logging clutter
    const response = await fetch(`/api/users/${id}`);
    return response.json();
  }
  
  @LogMethod({ includeResult: true })
  processUserData(data: any) {
    // Clean business logic
    return data.map((item: any) => item.processed = true);
  }
}

// 5. Context-based logging for grouped operations
class LoggingContext {
  private logger: Logger;
  private operation: string;
  private startTime: number;
  
  constructor(operation: string, logger?: Logger) {
    this.operation = operation;
    this.logger = logger || new Logger({ 
      level: 'info', 
      format: 'simple', 
      destination: 'console' 
    });
    this.startTime = Date.now();
    
    this.logger.info(`Starting ${this.operation}`);
  }
  
  complete(message?: string) {
    const duration = Date.now() - this.startTime;
    this.logger.info(`${this.operation} completed in ${duration}ms${message ? ': ' + message : ''}`);
  }
  
  fail(error: Error) {
    const duration = Date.now() - this.startTime;
    this.logger.error(`${this.operation} failed after ${duration}ms: ${error.message}`);
  }
}

// Usage with context
async function complexOperation() {
  const context = new LoggingContext('Data Processing');
  
  try {
    // Business logic here
    await processData();
    context.complete('Successfully processed 100 records');
  } catch (error) {
    context.fail(error as Error);
    throw error;
  }
}

export { Logger, LogMethod, LogApiCalls, LoggingContext };