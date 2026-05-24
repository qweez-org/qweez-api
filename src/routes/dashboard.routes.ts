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

    const topicsForClasses = await Topic.find({ classId: { $in: classes.map((c) => c._id) } });
    const topicIdsForClasses = topicsForClasses.map((t) => t._id);
    
    const counts = await Quiz.aggregate([
      { $match: { topicId: { $in: topicIdsForClasses } } },
      { $group: { _id: '$topicId', count: { $sum: 1 } } }
    ]);
    
    const quizCountMap = new Map();
    for (const c of counts) {
      quizCountMap.set(c._id.toString(), c.count);
    }

    const quizCountPerClass = classes.map((cls) => {
      const clsTopics = topicsForClasses.filter((t) => t.classId.toString() === cls._id.toString());
      const count = clsTopics.reduce((sum, t) => sum + (quizCountMap.get(t._id.toString()) || 0), 0);
      return { className: cls.name, classId: cls._id, quizCount: count };
    });

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
