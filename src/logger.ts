import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[LOG_LEVEL];
}

export const logger = {
  debug(...args: unknown[]) {
    if (shouldLog('debug')) {
      console.log(chalk.gray('[debug]'), ...args);
    }
  },

  info(...args: unknown[]) {
    if (shouldLog('info')) {
      console.log(chalk.blue('[info]'), ...args);
    }
  },

  warn(...args: unknown[]) {
    if (shouldLog('warn')) {
      console.log(chalk.yellow('[warn]'), ...args);
    }
  },

  error(...args: unknown[]) {
    if (shouldLog('error')) {
      console.error(chalk.red('[error]'), ...args);
    }
  },
};
