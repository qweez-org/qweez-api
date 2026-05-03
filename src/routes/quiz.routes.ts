import { Router, Response } from 'express';
import { Quiz } from '../models/Quiz.js';
import { Question } from '../models/Question.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

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
router.post('/topics/:topicId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, duration, mode, scheduledOpen, scheduledClose } = req.body;
    const quiz = new Quiz({
      title,
      duration,
      mode,
      scheduledOpen,
      scheduledClose,
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
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }
    res.json({ quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quiz' });
  }
});

// PATCH /api/quizzes/:quizId
router.patch('/:quizId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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

// DELETE /api/quizzes/:quizId
router.delete('/:quizId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }
    await Question.deleteMany({ quizId: req.params.quizId });
    res.json({ message: 'Quiz deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete quiz' });
  }
});

// GET /api/quizzes/:quizId/questions
router.get('/:quizId/questions', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const questions = await Question.find({ quizId: req.params.quizId }).sort({ order: 1, createdAt: 1 });
    res.json({ questions });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch questions' });
  }
});

// POST /api/quizzes/:quizId/questions
router.post('/:quizId/questions', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
