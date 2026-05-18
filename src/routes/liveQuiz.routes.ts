import { Router, Response } from 'express';
import { Quiz } from '../models/Quiz.js';
import { Attempt } from '../models/Attempt.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { getClassForUser, getManageableClassForTeacher } from '../utils/access.js';
import { createLiveSession, cancelLiveSession, getSessionByQuizId } from '../socket/liveQuizHandler.js';

const router = Router();

// POST /api/quizzes/:quizId/live/start — teacher creates a live session, gets a PIN
router.post('/:quizId/live/start', auth, authorize('teacher'), validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    const { Topic } = await import('../models/Topic.js');
    const topic = await Topic.findById(quiz.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    const manageable = await getManageableClassForTeacher(topic.classId.toString(), req.user!);
    if (!manageable) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const result = await createLiveSession(req.params.quizId, req.user!._id.toString());

    // Notify students in the class via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`class:${topic.classId}`).emit('live:started', {
        quizId: quiz._id,
        title: quiz.title,
        duration: quiz.duration,
        pin: result.pin,
      });
    }

    res.json({
      message: 'Live quiz session created',
      pin: result.pin,
      sessionId: result.sessionId,
      questionCount: result.questionCount,
    });
  } catch (error: any) {
    console.error('\x1b[31m❌ Error\x1b[0m live/start:', error.message || error);
    res.status(400).json({ message: error.message || 'Failed to start live quiz' });
  }
});

// POST /api/quizzes/:quizId/live/cancel — teacher cancels the session
router.post('/:quizId/live/cancel', auth, authorize('teacher'), validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const io = req.app.get('io');
    cancelLiveSession(req.params.quizId, io);
    await Quiz.findByIdAndUpdate(req.params.quizId, { status: 'draft' });

    res.json({ message: 'Live quiz cancelled' });
  } catch (error) {
    console.error('\x1b[31m❌ Error\x1b[0m live/cancel:', error);
    res.status(500).json({ message: 'Failed to cancel live quiz' });
  }
});

// GET /api/quizzes/:quizId/live/participants — get current participant list
router.get('/:quizId/live/participants', auth, validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    const { Topic } = await import('../models/Topic.js');
    const topic = await Topic.findById(quiz.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    const manageable = await getManageableClassForTeacher(topic.classId.toString(), req.user!);
    if (!manageable) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const session = getSessionByQuizId(req.params.quizId);
    if (!session) {
      res.status(404).json({ message: 'No active live quiz session' });
      return;
    }

    res.json({
      pin: session.pin,
      participantCount: session.participants.length,
      participants: session.participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
      })),
      status: session.status,
    });
  } catch (error) {
    console.error('\x1b[31m❌ Error\x1b[0m live/participants:', error);
    res.status(500).json({ message: 'Failed to get participants' });
  }
});

// GET /api/quizzes/:quizId/live/leaderboard — get current leaderboard
router.get('/:quizId/live/leaderboard', auth, validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    const { Topic } = await import('../models/Topic.js');
    const topic = await Topic.findById(quiz.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    if (req.user!.role === 'teacher') {
      const manageable = await getManageableClassForTeacher(topic.classId.toString(), req.user!);
      if (!manageable) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }

    // Students must be enrolled in the class
    if (req.user!.role === 'student') {
      const cls = await getClassForUser(topic.classId.toString(), req.user!);
      if (!cls) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }
    // First try from live session
    const session = getSessionByQuizId(req.params.quizId);
    if (session) {
      const scores: { userId: string; displayName: string; totalScore: number; totalTime: number }[] = [];
      for (const p of session.participants) {
        const userAnswers = session.answers[p.userId] || {};
        let totalScore = 0;
        let totalTime = 0;
        for (const ans of Object.values(userAnswers)) {
          totalScore += ans.points;
          totalTime += ans.timeMs;
        }
        scores.push({ userId: p.userId, displayName: p.displayName, totalScore, totalTime });
      }
      scores.sort((a, b) => b.totalScore - a.totalScore || a.totalTime - b.totalTime);
      res.json({
        leaderboard: scores.map((s, i) => ({
          rank: i + 1,
          user: { _id: s.userId, name: s.displayName },
          score: s.totalScore,
          totalTime: s.totalTime,
        })),
      });
      return;
    }

    // Fallback to DB attempts
    const attempts = await Attempt.find({
      quizId: req.params.quizId,
      status: 'submitted',
    })
      .populate('userId', 'name avatar')
      .sort({ score: -1, submittedAt: 1 })
      .limit(50);

    const leaderboard = attempts.map((a, i) => ({
      rank: i + 1,
      user: a.userId,
      score: a.score,
      totalPoints: a.totalPoints,
      submittedAt: a.submittedAt,
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('\x1b[31m❌ Error\x1b[0m live/leaderboard:', error);
    res.status(500).json({ message: 'Failed to get leaderboard' });
  }
});

export default router;
