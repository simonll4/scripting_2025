import winston from 'winston';

export const createLogger = (service: string, level: string = 'info') => {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          service: svc || service,
          message,
          ...meta
        });
      })
    ),
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      new winston.transports.File({ 
        filename: `logs/${service}-error.log`, 
        level: 'error' 
      }),
      new winston.transports.File({ 
        filename: `logs/${service}.log` 
      })
    ]
  });
};