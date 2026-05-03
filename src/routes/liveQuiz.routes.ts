import { Router, Response } from 'express';
import { Quiz } from '../models/Quiz.js';
import { Attempt } from '../models/Attempt.js';
import { Membership } from '../models/Membership.js';
import { Topic } from '../models/Topic.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

// In-memory store for live quiz sessions (in production, use Redis)
export const liveQuizSessions = new Map<string, {
  quizId: string;
  classId: string;
  participants: Set<string>;
  status: 'waiting' | 'in_progress' | 'finished';
}>();

// POST /api/quizzes/:quizId/live/start — teacher starts live quiz session
router.post('/:quizId/live/start', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId).populate('topicId', 'classId');
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    const topic = await Topic.findById(quiz.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    quiz.status = 'waiting';
    quiz.mode = 'live';
    await quiz.save();

    liveQuizSessions.set(quiz._id.toString(), {
      quizId: quiz._id.toString(),
      classId: topic.classId.toString(),
      participants: new Set(),
      status: 'waiting',
    });

    // Socket.IO event emission happens in the socket handler
    const io = req.app.get('io');
    if (io) {
      io.to(`class:${topic.classId}`).emit('live:started', {
        quizId: quiz._id,
        title: quiz.title,
        duration: quiz.duration,
      });
    }

    res.json({ message: 'Live quiz session started', quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to start live quiz' });
  }
});

// POST /api/quizzes/:quizId/live/join — student joins waiting room
router.post('/:quizId/live/join', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const session = liveQuizSessions.get(req.params.quizId);
    if (!session || session.status !== 'waiting') {
      res.status(400).json({ message: 'No active live quiz session' });
      return;
    }

    session.participants.add(req.user!._id.toString());

    const io = req.app.get('io');
    if (io) {
      io.to(`quiz:${req.params.quizId}`).emit('live:participant_joined', {
        userId: req.user!._id,
        name: req.user!.name,
        count: session.participants.size,
      });
    }

    res.json({ message: 'Joined live quiz', participantCount: session.participants.size });
  } catch (error) {
    res.status(500).json({ message: 'Failed to join live quiz' });
  }
});

// GET /api/quizzes/:quizId/live/participants
router.get('/:quizId/live/participants', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const session = liveQuizSessions.get(req.params.quizId);
    if (!session) {
      res.status(404).json({ message: 'No active live quiz session' });
      return;
    }

    res.json({
      participantCount: session.participants.size,
      participants: Array.from(session.participants),
      status: session.status,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get participants' });
  }
});

// POST /api/quizzes/:quizId/live/begin — teacher starts the quiz for everyone
router.post('/:quizId/live/begin', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const session = liveQuizSessions.get(req.params.quizId);
    if (!session || session.status !== 'waiting') {
      res.status(400).json({ message: 'No waiting live quiz session' });
      return;
    }

    session.status = 'in_progress';
    await Quiz.findByIdAndUpdate(req.params.quizId, { status: 'in_progress' });

    const io = req.app.get('io');
    if (io) {
      io.to(`quiz:${req.params.quizId}`).emit('live:begin', {
        quizId: req.params.quizId,
        startedAt: new Date(),
      });
    }

    res.json({ message: 'Live quiz started!' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to begin live quiz' });
  }
});

// POST /api/quizzes/:quizId/live/cancel
router.post('/:quizId/live/cancel', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    liveQuizSessions.delete(req.params.quizId);
    await Quiz.findByIdAndUpdate(req.params.quizId, { status: 'draft' });

    const io = req.app.get('io');
    if (io) {
      io.to(`quiz:${req.params.quizId}`).emit('live:cancelled', { quizId: req.params.quizId });
    }

    res.json({ message: 'Live quiz cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel live quiz' });
  }
});

// GET /api/quizzes/:quizId/live/leaderboard
router.get('/:quizId/live/leaderboard', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
    res.status(500).json({ message: 'Failed to get leaderboard' });
  }
});

export default router;
