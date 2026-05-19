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
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { getQuizContextForUser, getManageableClassForTeacher } from '../utils/access.js';
import { getSessionByQuizId } from '../socket/liveQuizHandler.js';

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
router.get('/topics/:topicId', auth, validateObjectIdParam('topicId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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

    const userId = req.user!._id.toString();
    const isOwner = cls.owner.toString() === userId;

    if (req.user!.role === 'teacher') {
      const isCoTeacher = await Membership.findOne({
        userId: req.user!._id,
        classId: cls._id,
        role: 'co-teacher',
        status: 'approved',
      });
      if (!isOwner && !isCoTeacher) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    } else {
      const membership = await Membership.findOne({ userId: req.user!._id, classId: cls._id, status: 'approved' });
      if (!isOwner && !membership) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }

    const quizzes = await Quiz.find({ topicId: req.params.topicId }).sort({ createdAt: -1 });

    // Attach questionCount for each quiz
    const quizIds = quizzes.map((q) => q._id);
    const counts = await Question.aggregate([
      { $match: { quizId: { $in: quizIds } } },
      { $group: { _id: '$quizId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    let completedMap = new Map<string, boolean>();
    if (req.user!.role === 'student') {
      const attempts = await Attempt.find({
        userId: req.user!._id,
        quizId: { $in: quizIds },
        status: 'submitted',
      }).select('quizId');
      for (const a of attempts) {
        completedMap.set(a.quizId.toString(), true);
      }
    }

    const quizzesWithCount = quizzes.map((q) => {
      const qObj = q.toObject();
      return {
        ...qObj,
        questionCount: countMap.get(q._id.toString()) || 0,
        isCompleted: completedMap.get(q._id.toString()) || false,
      };
    });

    res.json({ quizzes: quizzesWithCount });
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
  allowBacktrack: Joi.boolean(),
  shuffleQuestions: Joi.boolean(),
  shuffleOptions: Joi.boolean(),
  showAnswerKey: Joi.boolean(),
});

router.post('/topics/:topicId', auth, authorize('teacher'), validateObjectIdParam('topicId'), validate(createQuizSchema), async (req: AuthRequest, res: Response): Promise<void> => {
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

    const { title, duration, mode, attemptLimit, scheduledOpen, scheduledClose, description, allowBacktrack, shuffleQuestions, shuffleOptions, showAnswerKey } = req.body;
    const quiz = new Quiz({
      title,
      description,
      duration,
      mode,
      attemptLimit: mode === 'live' ? 1 : attemptLimit,
      scheduledOpen,
      scheduledClose,
      allowBacktrack,
      shuffleQuestions,
      shuffleOptions,
      showAnswerKey,
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
router.get('/:quizId', auth, validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
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
    const quizObj = ctx.quiz.toObject();
    if (quizObj.mode === 'live') {
      quizObj.isLiveSessionOpen = !!getSessionByQuizId(req.params.quizId);
    }

    res.json({ quiz: quizObj });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quiz' });
  }
});

// PATCH /api/quizzes/:quizId — Fix #3: verify ownership
const updateQuizSchema = Joi.object({
  title: Joi.string().min(2).max(300),
  description: Joi.string().max(1000).allow(''),
  duration: Joi.number().integer().min(1).max(480),
  mode: Joi.string().valid('scheduled', 'manual', 'live'),
  attemptLimit: Joi.number().integer().min(1).max(10),
  scheduledOpen: Joi.date().iso().allow(null),
  scheduledClose: Joi.date().iso().allow(null),
  status: Joi.string().valid('draft', 'scheduled', 'open', 'closed', 'waiting', 'in_progress', 'finished'),
  allowBacktrack: Joi.boolean(),
  shuffleQuestions: Joi.boolean(),
  shuffleOptions: Joi.boolean(),
  showAnswerKey: Joi.boolean(),
});

router.patch('/:quizId', auth, authorize('teacher'), validateObjectIdParam('quizId'), validate(updateQuizSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
    if (!hasAccess) {
      res.status(403).json({ message: 'You do not have access to this quiz' });
      return;
    }

    // Enforce attemptLimit=1 for live quizzes
    const updates = { ...req.body };
    if (updates.mode === 'live' || (!updates.mode && (await Quiz.findById(req.params.quizId))?.mode === 'live')) {
      updates.attemptLimit = 1;
    }
    const quiz = await Quiz.findByIdAndUpdate(req.params.quizId, updates, { new: true });
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
router.delete('/:quizId', auth, authorize('teacher'), validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
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
router.get('/:quizId/questions', auth, validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
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
    // For short_answer, don't send options at all (they contain correct answers)
    if (req.user!.role === 'student') {
      const sanitized = questions.map((q) => {
        const obj = q.toObject();
        if (obj.type === 'short_answer') {
          obj.options = [] as any;
        } else if (obj.options) {
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
  type: Joi.string().valid('multiple_choice', 'short_answer').required(),
  points: Joi.number().integer().min(1).max(1000).default(10),
  caseSensitive: Joi.boolean().default(false),
  spaceSensitive: Joi.boolean().default(false),
  options: Joi.array().items(
    Joi.object({
      text: Joi.string().required(),
      isCorrect: Joi.boolean().required(),
    })
  ).default([]),
});

router.post('/:quizId/questions', auth, authorize('teacher'), validateObjectIdParam('quizId'), validate(createQuestionSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
    if (!hasAccess) {
      res.status(403).json({ message: 'You do not have access to this quiz' });
      return;
    }

    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }
    if (quiz.status !== 'draft') {
      res.status(400).json({ message: 'Quiz is not editable' });
      return;
    }

    const { text, type, points, options, caseSensitive, spaceSensitive } = req.body;
    const count = await Question.countDocuments({ quizId: req.params.quizId });
    const question = new Question({
      quizId: req.params.quizId,
      text,
      type,
      points,
      caseSensitive,
      spaceSensitive,
      options,
      order: count + 1,
    });
    await question.save();
    res.status(201).json({ message: 'Question added', question });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add question' });
  }
});

// PATCH /api/quizzes/:quizId/questions/:questionId
const updateQuestionSchema = Joi.object({
  text: Joi.string().min(1).max(2000),
  type: Joi.string().valid('multiple_choice', 'short_answer'),
  points: Joi.number().integer().min(1).max(1000),
  caseSensitive: Joi.boolean(),
  spaceSensitive: Joi.boolean(),
  options: Joi.array().items(
    Joi.object({
      text: Joi.string().required(),
      isCorrect: Joi.boolean().required(),
    })
  ),
});

router.patch(
  '/:quizId/questions/:questionId',
  auth,
  authorize('teacher'),
  validateObjectIdParam('quizId'),
  validateObjectIdParam('questionId'),
  validate(updateQuestionSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
      if (!hasAccess) {
        res.status(403).json({ message: 'You do not have access to this quiz' });
        return;
      }

      const quiz = await Quiz.findById(req.params.quizId);
      if (!quiz) {
        res.status(404).json({ message: 'Quiz not found' });
        return;
      }
      if (quiz.status !== 'draft') {
        res.status(400).json({ message: 'Quiz is not editable' });
        return;
      }

      const question = await Question.findOneAndUpdate(
        { _id: req.params.questionId, quizId: req.params.quizId },
        req.body,
        { new: true, runValidators: true }
      );
      if (!question) {
        res.status(404).json({ message: 'Question not found' });
        return;
      }

      res.json({ message: 'Question updated', question });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update question' });
    }
  }
);

// DELETE /api/quizzes/:quizId/questions/:questionId
router.delete(
  '/:quizId/questions/:questionId',
  auth,
  authorize('teacher'),
  validateObjectIdParam('quizId'),
  validateObjectIdParam('questionId'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
      if (!hasAccess) {
        res.status(403).json({ message: 'You do not have access to this quiz' });
        return;
      }

      const quiz = await Quiz.findById(req.params.quizId);
      if (!quiz) {
        res.status(404).json({ message: 'Quiz not found' });
        return;
      }
      if (quiz.status !== 'draft') {
        res.status(400).json({ message: 'Quiz is not editable' });
        return;
      }

      const question = await Question.findOneAndDelete({ _id: req.params.questionId, quizId: req.params.quizId });
      if (!question) {
        res.status(404).json({ message: 'Question not found' });
        return;
      }

      res.json({ message: 'Question deleted' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete question' });
    }
  }
);

// PUT /api/quizzes/:quizId/questions/reorder
const reorderQuestionsSchema = Joi.object({
  questionIds: Joi.array().items(Joi.string().required()).min(1).required(),
});

router.put(
  '/:quizId/questions/reorder',
  auth,
  authorize('teacher'),
  validateObjectIdParam('quizId'),
  validate(reorderQuestionsSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const hasAccess = await verifyQuizOwnership(req.params.quizId, req.user!._id.toString());
      if (!hasAccess) {
        res.status(403).json({ message: 'You do not have access to this quiz' });
        return;
      }

      const quiz = await Quiz.findById(req.params.quizId);
      if (!quiz) {
        res.status(404).json({ message: 'Quiz not found' });
        return;
      }
      if (quiz.status !== 'draft') {
        res.status(400).json({ message: 'Quiz is not editable' });
        return;
      }

      const questionIds = req.body.questionIds as string[];

      const existing = await Question.find({ quizId: req.params.quizId }).select('_id');
      const existingIds = new Set(existing.map((q) => q._id.toString()));

      if (questionIds.length !== existing.length) {
        res.status(400).json({ message: 'questionIds must include all questions for this quiz' });
        return;
      }

      for (const id of questionIds) {
        if (!existingIds.has(id.toString())) {
          res.status(400).json({ message: 'questionIds contains invalid questionId' });
          return;
        }
      }

      await Question.bulkWrite(
        questionIds.map((id, idx) => ({
          updateOne: {
            filter: { _id: id, quizId: req.params.quizId },
            update: { $set: { order: idx + 1 } },
          },
        }))
      );

      res.json({ message: 'Questions reordered' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to reorder questions' });
    }
  }
);

export default router;
