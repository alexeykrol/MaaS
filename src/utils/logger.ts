/**
 * Simple Logger Utility
 *
 * Provides colored console logging with timestamps
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogMessage {
  level: LogLevel;
  timestamp: string;
  message: string;
  data?: any;
}

class Logger {
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = this.formatTimestamp();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (data !== undefined) {
      if (typeof data === 'object') {
        return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
      }
      return `${prefix} ${message} ${data}`;
    }

    return `${prefix} ${message}`;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('info', message, data));
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message: string, data?: any): void {
    console.error(this.formatMessage('error', message, data));
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      console.debug(this.formatMessage('debug', message, data));
    }
  }
}

// Export singleton instance
export const logger = new Logger();
