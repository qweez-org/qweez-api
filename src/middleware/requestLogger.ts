import { Request, Response, NextFunction } from 'express';

const methodColors: Record<string, string> = {
  GET:    '\x1b[32m',  // green
  POST:   '\x1b[33m',  // yellow
  PATCH:  '\x1b[35m',  // magenta
  PUT:    '\x1b[34m',  // blue
  DELETE: '\x1b[31m',  // red
};

const statusColor = (code: number): string => {
  if (code < 300) return '\x1b[32m'; // green
  if (code < 400) return '\x1b[36m'; // cyan
  if (code < 500) return '\x1b[33m'; // yellow
  return '\x1b[31m';                  // red
};

const reset = '\x1b[0m';
const dim = '\x1b[2m';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const mc = methodColors[method] || '';
    const sc = statusColor(res.statusCode);

    // Build log parts
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const methodStr = `${mc}${method.padEnd(6)}${reset}`;
    const statusStr = `${sc}${res.statusCode}${reset}`;
    const durationStr = `${dim}${duration}ms${reset}`;
    const path = req.originalUrl;

    // Extra context for important endpoints
    let extra = '';
    if (path.startsWith('/api/auth/login') && method === 'POST') {
      extra = ` ${dim}email=${req.body?.email || '?'}${reset}`;
    } else if (path.startsWith('/api/auth/register') && method === 'POST') {
      extra = ` ${dim}email=${req.body?.email || '?'} role=${req.body?.role || '?'}${reset}`;
    } else if (path.includes('/live/') && method === 'POST') {
      extra = ` ${dim}[LIVE]${reset}`;
    } else if (path.includes('/attempts') && method === 'POST') {
      extra = ` ${dim}[ATTEMPT]${reset}`;
    } else if (path.includes('/join-requests') && method === 'POST') {
      extra = ` ${dim}[JOIN]${reset}`;
    }

    console.log(`${dim}${timestamp}${reset}  ${methodStr} ${statusStr} ${path}  ${durationStr}${extra}`);
  });

  next();
};
