import { Quiz } from '../models/Quiz.js';
import { Attempt } from '../models/Attempt.js';
import { scoreAttempt } from './scoring.js';

export const startScheduler = (): void => {
  console.log('⏰ Quiz scheduler started (checking every 60s)');

  setInterval(async () => {
    try {
      const now = new Date();

      // Open scheduled quizzes
      const toOpen = await Quiz.updateMany(
        { status: 'scheduled', scheduledOpen: { $lte: now } },
        { $set: { status: 'open' } }
      );
      if (toOpen.modifiedCount > 0) {
        console.log(`⏰ Scheduler: Opened ${toOpen.modifiedCount} scheduled quiz(es)`);
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
    } catch (error) {
      console.error('⏰ Scheduler error:', error);
    }
  }, 60 * 1000);
};
