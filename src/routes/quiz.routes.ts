import { Router, Response } from 'express';
import { Quiz } from '../models/Quiz.js';
import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { Class } from '../models/Class.js';
import { Membership } from '../models/Membership.js';
import { Attempt } from '../models/Attempt.js';
import { Answer } from '../models/Answer.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';
import { getQuizContextForUser, getManageableClassForTeacher } from '../utils/access.js';

const router = Router();

// Helper: verify the requesting teacher owns or co-teaches the class containing this quiz
async function verifyQuizOwnership(quizId: string, userId: string): Promise<boolean> {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) return false;

  const topic = await Topic.findById(quiz.topicId);
  if (!topic) return false;

  const cls = await Class.findById(topic.classId);
  if (!cls) return false;

  // Owner check
  if (cls.owner.toString() === userId) return true;

  // Co-teacher check
  const coTeach = await Membership.findOne({
    userId, classId: cls._id, role: 'co-teacher', status: 'approved',
  });
  return !!coTeach;
}

// GET /api/quizzes/topics/:topicId
router.get('/topics/:topicId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quizzes = await Quiz.find({ topicId: req.params.topicId }).sort({ createdAt: -1 });
    res.json({ quizzes });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quizzes' });
  }
});

// POST /api/quizzes/topics/:topicId
const createQuizSchema = Joi.object({
  title: Joi.string().required().min(2).max(300),
  duration: Joi.number().integer().min(1).max(480).default(30),
  mode: Joi.string().valid('scheduled', 'manual', 'live').default('manual'),
  attemptLimit: Joi.number().integer().min(1).max(10).default(1),
  scheduledOpen: Joi.date().iso().allow(null),
  scheduledClose: Joi.date().iso().allow(null),
  description: Joi.string().max(1000).allow(''),
});

router.post('/topics/:topicId', auth, authorize('teacher'), validate(createQuizSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Verify the teacher owns this class
    const topic = await Topic.findById(req.params.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    const cls = await Class.findById(topic.classId);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const isOwner = cls.owner.toString() === req.user!._id.toString();
    const isCoTeacher = await Membership.findOne({
      userId: req.user!._id, classId: cls._id, role: 'co-teacher', status: 'approved',
    });

    if (!isOwner && !isCoTeacher) {
      res.status(403).json({ message: 'You do not have access to this class' });
      return;
    }

    const { title, duration, mode, attemptLimit, scheduledOpen, scheduledClose, description, allowBacktrack } = req.body;
    const quiz = new Quiz({
      title,
      description,
      duration,
      mode,
      attemptLimit,
      scheduledOpen,
      scheduledClose,
      allowBacktrack,
      topicId: req.params.topicId,
      status: 'draft',
    });
    await quiz.save();
    res.status(201).json({ message: 'Quiz created', quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create quiz' });
  }
});

// GET /api/quizzes/:quizId
router.get('/:quizId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ctx = await getQuizContextForUser(req.params.quizId, req.user!);
    if (!ctx) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    if (req.user!.role === 'teacher') {
      const manageable = await getManageableClassForTeacher(ctx.topic.classId.toString(), req.user!);
      if (!manageable) {
        res.status(403).json({ message: 'You do not have access to this quiz' });
        return;
      }
    }

    res.json({ quiz: ctx.quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quiz' });
  }
});

// PATCH /api/quizzes/:quizId — Fix #3: verify ownership
router.patch('/:quizId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
    if (!hasAccess) {
      res.status(403).json({ message: 'You do not have access to this quiz' });
      return;
    }

    const quiz = await Quiz.findByIdAndUpdate(req.params.quizId, req.body, { new: true });
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }
    res.json({ message: 'Quiz updated', quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update quiz' });
  }
});

// DELETE /api/quizzes/:quizId — Fix #4: verify ownership + cascade delete
router.delete('/:quizId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
    if (!hasAccess) {
      res.status(403).json({ message: 'You do not have access to this quiz' });
      return;
    }

    const quiz = await Quiz.findByIdAndDelete(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }
    // Cascade delete questions, attempts, and answers
    const questions = await Question.find({ quizId: req.params.quizId });
    await Question.deleteMany({ quizId: req.params.quizId });
    const attempts = await Attempt.find({ quizId: req.params.quizId });
    const attemptIds = attempts.map((a) => a._id);
    await Answer.deleteMany({ attemptId: { $in: attemptIds } });
    await Attempt.deleteMany({ quizId: req.params.quizId });

    res.json({ message: 'Quiz deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete quiz' });
  }
});

// GET /api/quizzes/:quizId/questions
router.get('/:quizId/questions', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ctx = await getQuizContextForUser(req.params.quizId, req.user!);
    if (!ctx) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    if (req.user!.role === 'teacher') {
      const manageable = await getManageableClassForTeacher(ctx.topic.classId.toString(), req.user!);
      if (!manageable) {
        res.status(403).json({ message: 'You do not have access to this quiz' });
        return;
      }
    }

    const questions = await Question.find({ quizId: req.params.quizId }).sort({ order: 1, createdAt: 1 });

    // Bug #6 fix: Strip isCorrect from options for student users
    if (req.user!.role === 'student') {
      const sanitized = questions.map((q) => {
        const obj = q.toObject();
        if (obj.options) {
          obj.options = obj.options.map((o: any) => ({ text: o.text })) as any;
        }
        return obj;
      });
      res.json({ questions: sanitized });
      return;
    }

    res.json({ questions });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch questions' });
  }
});

// POST /api/quizzes/:quizId/questions — Fix #14: add validation
const createQuestionSchema = Joi.object({
  text: Joi.string().required().min(1).max(2000),
  type: Joi.string().valid('multiple_choice', 'essay').required(),
  points: Joi.number().integer().min(1).max(1000).default(10),
  options: Joi.array().items(
    Joi.object({
      text: Joi.string().required(),
      isCorrect: Joi.boolean().required(),
    })
  ).default([]),
});

router.post('/:quizId/questions', auth, authorize('teacher'), validate(createQuestionSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
    if (!hasAccess) {
      res.status(403).json({ message: 'You do not have access to this quiz' });
      return;
    }

    const { text, type, points, options } = req.body;
    const count = await Question.countDocuments({ quizId: req.params.quizId });
    const question = new Question({
      quizId: req.params.quizId,
      text,
      type,
      points,
      options,
      order: count + 1,
    });
    await question.save();
    res.status(201).json({ message: 'Question added', question });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add question' });
  }
});

export default router;
