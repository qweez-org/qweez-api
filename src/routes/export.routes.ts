import { Router, Response } from 'express';
import { Topic } from '../models/Topic.js';
import { Quiz } from '../models/Quiz.js';
import { Attempt } from '../models/Attempt.js';
import { Membership } from '../models/Membership.js';
import { Question } from '../models/Question.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

// GET /api/classes/:classId/export/grades — Export gradebook as CSV
router.get('/classes/:classId/export/grades', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const topics = await Topic.find({ classId: req.params.classId });
    const topicIds = topics.map((t) => t._id);
    const quizzes = await Quiz.find({ topicId: { $in: topicIds } }).sort({ createdAt: 1 });
    const quizIds = quizzes.map((q) => q._id);

    const members = await Membership.find({
      classId: req.params.classId, role: 'student', status: 'approved',
    }).populate('userId', 'name email');

    const attempts = await Attempt.find({ quizId: { $in: quizIds }, status: 'submitted' });

    // Build CSV
    const header = ['Nama', 'Email', ...quizzes.map((q) => q.title), 'Rata-rata'].join(',');
    const rows = members.map((m) => {
      const user = m.userId as any;
      const scores = quizzes.map((q) => {
        const attempt = attempts.find((a) => a.userId.toString() === user._id.toString() && a.quizId.toString() === q._id.toString());
        return attempt ? `${attempt.score ?? 0}/${attempt.totalPoints ?? 0}` : '-';
      });
      const numericScores = quizzes.map((q) => {
        const attempt = attempts.find((a) => a.userId.toString() === user._id.toString() && a.quizId.toString() === q._id.toString());
        return attempt && attempt.totalPoints ? Math.round(((attempt.score ?? 0) / attempt.totalPoints) * 100) : null;
      }).filter((s) => s !== null) as number[];
      const avg = numericScores.length > 0 ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length) : '-';
      return [user.name, user.email, ...scores, avg].join(',');
    });

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gradebook-${req.params.classId}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export grades' });
  }
});

// GET /api/quizzes/:quizId/export/results — Export quiz results as CSV
router.get('/quizzes/:quizId/export/results', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) { res.status(404).json({ message: 'Quiz not found' }); return; }

    const questions = await Question.find({ quizId: quiz._id }).sort({ order: 1 });
    const attempts = await Attempt.find({ quizId: quiz._id, status: 'submitted' })
      .populate('userId', 'name email')
      .sort({ score: -1 });

    const header = ['Nama', 'Email', 'Skor', 'Total', 'Persentase', 'Waktu Mulai', 'Waktu Selesai'].join(',');
    const rows = attempts.map((a) => {
      const user = a.userId as any;
      const pct = a.totalPoints ? Math.round(((a.score ?? 0) / a.totalPoints) * 100) : 0;
      return [
        user.name, user.email, a.score ?? 0, a.totalPoints ?? 0, `${pct}%`,
        a.startedAt?.toISOString() || '', a.submittedAt?.toISOString() || '',
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="quiz-results-${req.params.quizId}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export quiz results' });
  }
});

export default router;
