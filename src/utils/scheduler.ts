import { Server as SocketIOServer } from 'socket.io';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';
import { Membership } from '../models/Membership.js';
import { Notification } from '../models/Notification.js';
import { Attempt } from '../models/Attempt.js';
import { scoreAttempt } from './scoring.js';

export const runScheduler = async (io?: SocketIOServer): Promise<void> => {
  console.log('⏰ Running scheduled quiz job...');

  try {
      const now = new Date();

      // Find quizzes that should be opened
      const quizzesToOpen = await Quiz.find({
        status: 'scheduled',
        scheduledOpen: { $lte: now },
      });

      if (quizzesToOpen.length > 0) {
        const quizIds = quizzesToOpen.map((q) => q._id);
        await Quiz.updateMany({ _id: { $in: quizIds } }, { $set: { status: 'open' } });
        console.log(`⏰ Scheduler: Opened ${quizzesToOpen.length} scheduled quiz(es)`);

        // Notify enrolled students
        for (const quiz of quizzesToOpen) {
          try {
            const topic = await Topic.findById(quiz.topicId);
            if (!topic) continue;

            const members = await Membership.find({
              classId: topic.classId,
              role: 'student',
              status: 'approved',
            });

            // Create notifications
            const notifDocs = members.map((m) => ({
              userId: m.userId,
              type: 'quiz_open',
              title: `Kuis Dibuka: ${quiz.title}`,
              message: `Kuis "${quiz.title}" sekarang tersedia.`,
              quizId: quiz._id,
              isRead: false,
            }));
            if (notifDocs.length > 0) {
              await Notification.insertMany(notifDocs);
            }

            // Emit socket event to class room
            if (io) {
              io.to(`class:${topic.classId}`).emit('quiz:opened', {
                quizId: quiz._id,
                title: quiz.title,
                topicId: quiz.topicId,
              });
            }
          } catch (err) {
            console.error(`⏰ Scheduler: Failed to notify for quiz ${quiz._id}:`, err);
          }
        }
      }

      // Close expired quizzes — first find them so we can auto-submit attempts
      const expiredQuizzes = await Quiz.find({
        status: 'open',
        scheduledClose: { $lte: now, $ne: null },
      });

      if (expiredQuizzes.length > 0) {
        const quizIds = expiredQuizzes.map((q) => q._id);

        // Bug #1 fix: Auto-submit all in-progress attempts before closing
        const inProgressAttempts = await Attempt.find({
          quizId: { $in: quizIds },
          status: 'in_progress',
        });

        for (const attempt of inProgressAttempts) {
          try {
            attempt.status = 'submitted';
            attempt.submittedAt = now;
            await attempt.save();
            await scoreAttempt(attempt._id.toString());
            console.log(`⏰ Scheduler: Auto-submitted attempt ${attempt._id}`);
          } catch (err) {
            console.error(`⏰ Scheduler: Failed to auto-submit attempt ${attempt._id}:`, err);
          }
        }

        // Now close the quizzes
        await Quiz.updateMany(
          { _id: { $in: quizIds } },
          { $set: { status: 'closed' } }
        );
        console.log(`⏰ Scheduler: Closed ${expiredQuizzes.length} expired quiz(es), auto-submitted ${inProgressAttempts.length} attempt(s)`);
      }

      // Sweep for in_progress attempts that exceeded their duration (useful for manual/live quizzes)
      const allInProgressAttempts = await Attempt.find({ status: 'in_progress' });
      for (const attempt of allInProgressAttempts) {
        try {
          const quiz = await Quiz.findById(attempt.quizId);
          if (quiz && quiz.duration > 0) {
            const elapsedMs = now.getTime() - attempt.startedAt.getTime();
            const maxDurationMs = quiz.duration * 60 * 1000 + 120000; // 2 min grace period
            if (elapsedMs > maxDurationMs) {
              attempt.status = 'submitted';
              attempt.submittedAt = now;
              await attempt.save();
              await scoreAttempt(attempt._id.toString());
              console.log(`⏰ Scheduler: Auto-submitted attempt ${attempt._id} due to time limit`);
            }
          }
        } catch (err) {
          console.error(`⏰ Scheduler: Failed to time-check attempt ${attempt._id}:`, err);
        }
      }
    } catch (error) {
      console.error('⏰ Scheduler error:', error);
    }
};
