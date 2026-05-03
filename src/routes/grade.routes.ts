import { Router, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';
import { Membership } from '../models/Membership.js';
import { auth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/classes/:classId/grades — gradebook for a class
router.get('/classes/:classId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const topics = await Topic.find({ classId: req.params.classId });
    const topicIds = topics.map((t) => t._id);
    const quizzes = await Quiz.find({ topicId: { $in: topicIds } });
    const quizIds = quizzes.map((q) => q._id);

    let filter: any = { quizId: { $in: quizIds }, status: 'submitted' };
    if (req.user!.role === 'student') {
      filter.userId = req.user!._id;
    }

    const attempts = await Attempt.find(filter)
      .populate('userId', 'name email')
      .populate('quizId', 'title topicId')
      .sort({ submittedAt: -1 });

    // Get all students in the class for the grade matrix
    const members = await Membership.find({
      classId: req.params.classId,
      role: 'student',
      status: 'approved',
    }).populate('userId', 'name email');

    res.json({ grades: attempts, quizzes, members, topics });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch grades' });
  }
});

// GET /api/quizzes/:quizId/grades — grades for a specific quiz
router.get('/quizzes/:quizId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attempts = await Attempt.find({
      quizId: req.params.quizId,
      status: 'submitted',
    })
      .populate('userId', 'name email avatar')
      .sort({ score: -1 });

    const quiz = await Quiz.findById(req.params.quizId);

    res.json({ grades: attempts, quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quiz grades' });
  }
});

export default router;
