import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import os from 'os';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { setupSocketIO } from './socket/index.js';
import { startScheduler } from './utils/scheduler.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import classRoutes from './routes/class.routes.js';
import joinRequestRoutes from './routes/joinRequest.routes.js';
import memberRoutes from './routes/member.routes.js';
import topicRoutes from './routes/topic.routes.js';
import quizRoutes from './routes/quiz.routes.js';
import attemptRoutes from './routes/attempt.routes.js';
import gradeRoutes from './routes/grade.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import liveQuizRoutes from './routes/liveQuiz.routes.js';
import coTeacherRoutes from './routes/coTeacher.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import exportRoutes from './routes/export.routes.js';

const allowedOrigins = env.CORS_ORIGIN
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isLocalhostOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '10.0.2.2';
  } catch {
    return false;
  }
};

const isLocalNetworkOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    const parts = url.hostname.split('.');
    if (parts.length !== 4) return false;
    const [a, b] = parts.map(Number);
    // 192.168.x.x or 10.x.x.x
    if (a === 192 && b === 168) return true;
    if (a === 10) return true;
    // 172.16-31.x.x
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  } catch {
    return false;
  }
};

const isDevAllowedOrigin = (origin: string) => {
  return isLocalhostOrigin(origin) || isLocalNetworkOrigin(origin);
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header), e.g. curl, server-to-server
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development allow any localhost or local network origin regardless of port
    if (env.NODE_ENV === 'development' && isDevAllowedOrigin(origin)) return callback(null, true);
    console.warn(`⚠️ CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, cb) => {
      // Allow native clients (no Origin header), e.g. Flutter mobile app
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (env.NODE_ENV === 'development' && isDevAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
app.set('io', io);
setupSocketIO(io);

// Middleware
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting (higher limit in development)
const limiter = rateLimit({
  windowMs: env.NODE_ENV === 'development' ? 1 * 60 * 1000 : 15 * 60 * 1000,
  max: env.NODE_ENV === 'development' ? 2000 : 200,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stricter rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? 100 : 5,
  message: { message: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/refresh', authLimiter);

// Request logger (development only)
if (env.NODE_ENV === 'development') {
  app.use(requestLogger);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/classes/join-requests', joinRequestRoutes);
app.use('/api/classes/members', memberRoutes);
app.use('/api/classes/topics', topicRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/quizzes', liveQuizRoutes);
app.use('/api/classes', coTeacherRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

export { app, httpServer, io };

// Start
const start = async (): Promise<void> => {
  await connectDB();

  if (env.REDIS_URL) {
    const pubClient = createClient({ url: env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));
  }

  startScheduler(io);

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`\n🚀 Qweez API running:`);
    console.log(`   Local:    http://localhost:${env.PORT}`);
    if (localIP) {
      console.log(`   Network:  http://${localIP}:${env.PORT}`);
    }
    console.log(`📡 Socket.IO ready\n`);
  });
};

function getLocalIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.family === 'IPv4' && !entry.internal) {
        const parts = entry.address.split('.');
        const [a, b] = parts.map(Number);
        if (a === 192 && b === 168) return entry.address;
        if (a === 10) return entry.address;
        if (a === 172 && b >= 16 && b <= 31) return entry.address;
      }
    }
  }
  return null;
}

// Only start the server when run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  start();
}
