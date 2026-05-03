import { Quiz } from '../models/Quiz.js';

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

      // Close expired quizzes
      const toClose = await Quiz.updateMany(
        { status: 'open', scheduledClose: { $lte: now, $ne: null } },
        { $set: { status: 'closed' } }
      );
      if (toClose.modifiedCount > 0) {
        console.log(`⏰ Scheduler: Closed ${toClose.modifiedCount} expired quiz(es)`);
      }
    } catch (error) {
      console.error('⏰ Scheduler error:', error);
    }
  }, 60 * 1000);
};
