import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
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

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header), e.g. curl, server-to-server
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});
app.set('io', io);
setupSocketIO(io);

// Middleware
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

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

// Start
const start = async (): Promise<void> => {
  await connectDB();
  startScheduler();
  httpServer.listen(env.PORT, () => {
    console.log(`\n🚀 Qweez API running on http://localhost:${env.PORT}`);
    console.log(`📡 Socket.IO ready\n`);
  });
};

start();
