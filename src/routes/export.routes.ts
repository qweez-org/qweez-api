import { Router, Response } from 'express';
import { Topic } from '../models/Topic.js';
import { Quiz } from '../models/Quiz.js';
import { Attempt } from '../models/Attempt.js';
import { Membership } from '../models/Membership.js';
import { Question } from '../models/Question.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { getManageableClassForTeacher } from '../utils/access.js';

const router = Router();

// Fix #34: Sanitize CSV cell values to prevent formula injection
function sanitizeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  // Escape values that start with formula-triggering characters
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  // Wrap in quotes if it contains commas or quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// GET /api/classes/:classId/export/grades — Export gradebook as CSV
router.get('/classes/:classId/export/grades', auth, authorize('teacher'), validateObjectIdParam('classId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const topics = await Topic.find({ classId: req.params.classId });
    const topicIds = topics.map((t) => t._id);
    const quizzes = await Quiz.find({ topicId: { $in: topicIds } }).sort({ createdAt: 1 });
    const quizIds = quizzes.map((q) => q._id);

    const members = await Membership.find({
      classId: req.params.classId, role: 'student', status: 'approved',
    }).populate('userId', 'name email');

    const attempts = await Attempt.find({ quizId: { $in: quizIds }, status: 'submitted' });

    // Build CSV
    const header = [sanitizeCsvCell('Nama'), sanitizeCsvCell('Email'), ...quizzes.map((q) => sanitizeCsvCell(q.title)), sanitizeCsvCell('Rata-rata')].join(',');
    const rows = members.map((m) => {
      const user = m.userId as any;
      const scores = quizzes.map((q) => {
        const attempt = attempts.find((a) => a.userId.toString() === user._id.toString() && a.quizId.toString() === q._id.toString());
        return attempt ? sanitizeCsvCell(`${attempt.score ?? 0}/${attempt.totalPoints ?? 0}`) : '-';
      });
      const numericScores = quizzes.map((q) => {
        const attempt = attempts.find((a) => a.userId.toString() === user._id.toString() && a.quizId.toString() === q._id.toString());
        return attempt && attempt.totalPoints ? Math.round(((attempt.score ?? 0) / attempt.totalPoints) * 100) : null;
      }).filter((s) => s !== null) as number[];
      const avg = numericScores.length > 0 ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length) : '-';
      return [sanitizeCsvCell(user.name), sanitizeCsvCell(user.email), ...scores, sanitizeCsvCell(avg)].join(',');
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
router.get('/quizzes/:quizId/export/results', auth, authorize('teacher'), validateObjectIdParam('quizId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) { res.status(404).json({ message: 'Quiz not found' }); return; }

    const { Topic } = await import('../models/Topic.js');
    const topic = await Topic.findById(quiz.topicId);
    if (!topic) { res.status(404).json({ message: 'Topic not found' }); return; }

    const manageable = await getManageableClassForTeacher(topic.classId.toString(), req.user!);
    if (!manageable) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const questions = await Question.find({ quizId: quiz._id }).sort({ order: 1 });
    const attempts = await Attempt.find({ quizId: quiz._id, status: 'submitted' })
      .populate('userId', 'name email')
      .sort({ score: -1 });

    const header = ['Nama', 'Email', 'Skor', 'Total', 'Persentase', 'Waktu Mulai', 'Waktu Selesai'].map(sanitizeCsvCell).join(',');
    const rows = attempts.map((a) => {
      const user = a.userId as any;
      const pct = a.totalPoints ? Math.round(((a.score ?? 0) / a.totalPoints) * 100) : 0;
      return [
        sanitizeCsvCell(user.name), sanitizeCsvCell(user.email), a.score ?? 0, a.totalPoints ?? 0, `${pct}%`,
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
