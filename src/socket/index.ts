import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { registerLiveQuizHandlers } from './liveQuizHandler.js';

export const setupSocketIO = (io: SocketIOServer): void => {
  // Auth middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token as string, env.JWT_SECRET) as { userId: string };
      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(new Error('User not found'));
      }

      (socket as any).user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    console.log(`🔌 Socket connected: ${user.name} (${user._id})`);

    // Fix #31: Verify membership before allowing class room join
    socket.on('join:class', async (classId: string) => {
      try {
        // Teachers who own the class can join
        const { Class } = await import('../models/Class.js');
        const cls = await Class.findById(classId);
        if (!cls) return;

        const isOwner = cls.owner.toString() === user._id.toString();
        const isMember = await Membership.findOne({
          userId: user._id,
          classId,
          status: 'approved',
        });

        if (isOwner || isMember) {
          socket.join(`class:${classId}`);
        }
      } catch (e) {
        // Silently reject unauthorized joins
      }
    });

    // Join quiz room (for live quiz notifications)
    socket.on('join:quiz', (quizId: string) => {
      socket.join(`quiz:${quizId}`);
    });

    // Leave quiz room
    socket.on('leave:quiz', (quizId: string) => {
      socket.leave(`quiz:${quizId}`);
    });

    // ── Live Quiz Handlers ─────────────────────────────────────────────────
    registerLiveQuizHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${user.name}`);
    });
  });
};
