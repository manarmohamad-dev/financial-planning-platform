import pino, { type DestinationStream } from 'pino';
export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      redact: {
        paths: [
          'password',
          'password_hash',
          'token',
          'secret',
          'cookie',
          'authorization',
          'req.headers.cookie',
          'req.headers.authorization',
          'req.body',
          'body',
          'DATABASE_URL',
          'SESSION_SECRET',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}
export const logger = createLogger();
export function safeRequestLog(method: string, path: string, status: number, requestId: string) {
  return { method, route: path.split('?')[0], status, requestId };
}
