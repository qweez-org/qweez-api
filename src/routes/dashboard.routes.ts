import { Router, Response } from 'express';
import { Class } from '../models/Class.js';
import { Topic } from '../models/Topic.js';
import { Quiz } from '../models/Quiz.js';
import { Membership } from '../models/Membership.js';
import { Attempt } from '../models/Attempt.js';
import { auth, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/stats', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const classes = await Class.find({ owner: req.user!._id });
    const classIds = classes.map((c) => c._id);

    const coTeachMemberships = await Membership.find({
      userId: req.user!._id, role: 'co-teacher', status: 'approved',
    });
    const allClassIds = [...classIds, ...coTeachMemberships.map((m) => m.classId)];

    const topics = await Topic.find({ classId: { $in: allClassIds } });
    const topicIds = topics.map((t) => t._id);
    const quizzes = await Quiz.find({ topicId: { $in: topicIds } });
    const quizIds = quizzes.map((q) => q._id);

    const studentCount = await Membership.countDocuments({
      classId: { $in: allClassIds }, role: 'student', status: 'approved',
    });
    const pendingCount = await Membership.countDocuments({
      classId: { $in: allClassIds }, status: 'pending',
    });

    const recentAttempts = await Attempt.find({ quizId: { $in: quizIds }, status: 'submitted' })
      .populate('userId', 'name email avatar')
      .populate('quizId', 'title')
      .sort({ submittedAt: -1 })
      .limit(10);

    const quizCountPerClass = await Promise.all(
      classes.map(async (cls) => {
        const ct = await Topic.find({ classId: cls._id });
        const count = await Quiz.countDocuments({ topicId: { $in: ct.map((t) => t._id) } });
        return { className: cls.name, classId: cls._id, quizCount: count };
      })
    );

    res.json({
      stats: { classCount: allClassIds.length, topicCount: topics.length, quizCount: quizzes.length, studentCount, pendingCount },
      recentAttempts,
      quizCountPerClass,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
});

export default router;
