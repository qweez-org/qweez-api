import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

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

    // Join class rooms
    socket.on('join:class', (classId: string) => {
      socket.join(`class:${classId}`);
      console.log(`  → ${user.name} joined class room: ${classId}`);
    });

    // Join quiz room (for live quiz)
    socket.on('join:quiz', (quizId: string) => {
      socket.join(`quiz:${quizId}`);
      console.log(`  → ${user.name} joined quiz room: ${quizId}`);
    });

    // Leave quiz room
    socket.on('leave:quiz', (quizId: string) => {
      socket.leave(`quiz:${quizId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${user.name}`);
    });
  });
};
