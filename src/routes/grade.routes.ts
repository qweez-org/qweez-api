import { Router, Response } from 'express';
import { Attempt } from '../models/Attempt.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';
import { Membership } from '../models/Membership.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { getClassForUser, getManageableClassForTeacher, getQuizContextForUser } from '../utils/access.js';

const router = Router();

// GET /api/classes/:classId/grades — gradebook for a class
router.get('/classes/:classId', auth, validateObjectIdParam('classId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await getClassForUser(req.params.classId, req.user!);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    // Teachers must own/co-teach; students must be enrolled (handled by getClassForUser)
    if (req.user!.role === 'teacher') {
      const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
      if (!manageable) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }

    const topics = await Topic.find({ classId: req.params.classId });
    const topicIds = topics.map((t) => t._id);
    const quizzes = await Quiz.find({ topicId: { $in: topicIds }, status: { $nin: ['draft', 'scheduled'] } });
    const quizIds = quizzes.map((q) => q._id);

    let filter: any = { quizId: { $in: quizIds }, status: 'submitted' };
    if (req.user!.role === 'student') {
      filter.userId = req.user!._id;
    }

    const attempts = await Attempt.find(filter)
      .populate('userId', 'name email')
      .populate('quizId', 'title topicId')
      .sort({ submittedAt: -1 });

    // Add earnedPoints alias for mobile compatibility
    const grades = attempts.map((a) => {
      const obj = a.toObject();
      return { ...obj, earnedPoints: obj.score ?? 0 };
    });

    // Get all students in the class for the grade matrix
    const members = await Membership.find({
      classId: req.params.classId,
      role: 'student',
      status: 'approved',
    }).populate('userId', 'name email');

    res.json({ grades, quizzes, members, topics });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch grades' });
  }
});

// GET /api/quizzes/:quizId/grades — grades for a specific quiz
router.get('/quizzes/:quizId', auth, validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ctx = await getQuizContextForUser(req.params.quizId, req.user!);
    if (!ctx) {
      res.status(404).json({ message: 'Quiz not found' });
      return;
    }

    if (req.user!.role === 'teacher') {
      const manageable = await getManageableClassForTeacher(ctx.topic.classId.toString(), req.user!);
      if (!manageable) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }

    const filter: any = { quizId: req.params.quizId, status: 'submitted' };
    if (req.user!.role === 'student') {
      filter.userId = req.user!._id;
    }

    const attempts = await Attempt.find(filter)
      .populate('userId', 'name email avatar')
      .sort({ score: -1 });

    res.json({ grades: attempts, quiz: ctx.quiz });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch quiz grades' });
  }
});

export default router;
