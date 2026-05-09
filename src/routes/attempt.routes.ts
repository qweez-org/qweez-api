import { Router, Response } from 'express';
import Joi from 'joi';
import { Attempt } from '../models/Attempt.js';
import { Answer } from '../models/Answer.js';
import { Quiz } from '../models/Quiz.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { Class } from '../models/Class.js';
import { Membership } from '../models/Membership.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { scoreAttempt } from '../utils/scoring.js';

const router = Router();

// POST /api/quizzes/:quizId/start — start a new attempt
router.post('/quizzes/:quizId/start', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    if (quiz.status !== 'open' && quiz.status !== 'in_progress') {
      res.status(400).json({ message: 'Quiz is not currently open' });
      return;
    }

    // Check attempt limit
    const attemptCount = await Attempt.countDocuments({
      userId: req.user!._id,
      quizId: quiz._id,
    });

    if (attemptCount >= quiz.attemptLimit) {
      res.status(400).json({ message: 'Attempt limit reached' });
      return;
    }

    // Check for in-progress attempt
    const inProgress = await Attempt.findOne({
      userId: req.user!._id,
      quizId: quiz._id,
      status: 'in_progress',
    });

    if (inProgress) {
      res.json({ attempt: inProgress, message: 'Resuming existing attempt' });
      return;
    }

    const attempt = await Attempt.create({
      userId: req.user!._id,
      quizId: quiz._id,
      startedAt: new Date(),
    });

    res.status(201).json({ attempt });
  } catch (error) {
    res.status(500).json({ message: 'Failed to start attempt' });
  }
});

// GET /api/attempts/:attemptId — Fix #5: ownership check
router.get('/:attemptId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId)
      .populate('quizId', 'title duration topicId')
      .populate('userId', 'name email');

    if (!attempt) {
      res.status(404).json({ message: 'Attempt not found' });
      return;
    }

    // Students can only see their own attempts; teachers can see any in their classes
    if (req.user!.role === 'student') {
      if (attempt.userId && (attempt.userId as any)._id?.toString() !== req.user!._id.toString() &&
          attempt.userId?.toString() !== req.user!._id.toString()) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }

    const answers = await Answer.find({ attemptId: attempt._id });
    res.json({ attempt, answers });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attempt' });
  }
});

// PUT /api/attempts/:attemptId/answers — Fix #6: ownership check
const saveAnswersSchema = Joi.object({
  answers: Joi.array().items(
    Joi.object({
      questionId: Joi.string().required(),
      answer: Joi.string().required().allow(''),
    })
  ).required(),
});

router.put('/:attemptId/answers', auth, validate(saveAnswersSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt || attempt.status !== 'in_progress') {
      res.status(400).json({ message: 'Attempt not found or already submitted' });
      return;
    }

    // Fix #6: Only the attempt owner can save answers
    if (attempt.userId.toString() !== req.user!._id.toString()) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    // Check time limit
    const quiz = await Quiz.findById(attempt.quizId);
    if (quiz) {
      const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000 / 60;
      if (elapsed > quiz.duration + 1) { // 1 minute grace
        // Auto-submit
        attempt.status = 'submitted';
        attempt.submittedAt = new Date();
        await attempt.save();
        await scoreAttempt(attempt._id.toString());
        
        const io = req.app.get('io');
        if (io) {
          io.to(`quiz:${attempt.quizId}`).emit('live:leaderboard_update', {
            quizId: attempt.quizId,
            attemptId: attempt._id,
          });
        }
        
        res.status(400).json({ message: 'Time expired. Attempt auto-submitted.' });
        return;
      }
    }

    for (const ans of req.body.answers) {
      await Answer.findOneAndUpdate(
        { attemptId: attempt._id, questionId: ans.questionId },
        { answer: ans.answer },
        { upsert: true, new: true }
      );
    }

    res.json({ message: 'Answers saved' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save answers' });
  }
});

// POST /api/attempts/:attemptId/submit — Fix #6: ownership check
router.post('/:attemptId/submit', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt || attempt.status !== 'in_progress') {
      res.status(400).json({ message: 'Attempt not found or already submitted' });
      return;
    }

    // Fix #6: Only the attempt owner can submit
    if (attempt.userId.toString() !== req.user!._id.toString()) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    const result = await scoreAttempt(attempt._id.toString());

    const io = req.app.get('io');
    if (io) {
      io.to(`quiz:${attempt.quizId}`).emit('live:leaderboard_update', {
        quizId: attempt.quizId,
        attemptId: attempt._id,
      });
    }

    res.json({ attempt, ...result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit attempt' });
  }
});

// GET /api/attempts — Fix #7: restrict teacher scope to their classes
router.get('/', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: any = {};

    if (req.user!.role === 'student') {
      filter.userId = req.user!._id;
    } else if (req.user!.role === 'teacher') {
      // Teachers can only see attempts for quizzes in classes they own or co-teach
      const ownedClasses = await Class.find({ owner: req.user!._id });
      const coTeachMemberships = await Membership.find({
        userId: req.user!._id, role: 'co-teacher', status: 'approved',
      });
      const allClassIds = [
        ...ownedClasses.map((c) => c._id),
        ...coTeachMemberships.map((m) => m.classId),
      ];
      const topics = await Topic.find({ classId: { $in: allClassIds } });
      const topicIds = topics.map((t) => t._id);
      const quizzes = await Quiz.find({ topicId: { $in: topicIds } });
      const quizIds = quizzes.map((q) => q._id);
      filter.quizId = { $in: quizIds };
    }

    if (req.query.quizId) filter.quizId = req.query.quizId;

    const attempts = await Attempt.find(filter)
      .populate('quizId', 'title duration topicId')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ attempts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attempts' });
  }
});

export default router;
