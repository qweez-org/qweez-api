import { Router, Response } from 'express';
import Joi from 'joi';
import { Topic } from '../models/Topic.js';
import { Quiz } from '../models/Quiz.js';
import { TeacherAssignment } from '../models/TeacherAssignment.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { getClassForUser, getManageableClassForTeacher } from '../utils/access.js';

const router = Router();

// POST /api/classes/:classId/topics
const createTopicSchema = Joi.object({
  name: Joi.string().required().min(2).max(200),
});

router.post('/:classId', auth, authorize('teacher'), validate(createTopicSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const topic = await Topic.create({
      name: req.body.name,
      classId: req.params.classId,
    });
    res.status(201).json({ topic });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create topic' });
  }
});

// GET /api/classes/:classId/topics
router.get('/:classId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await getClassForUser(req.params.classId, req.user!);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const topics = await Topic.find({ classId: req.params.classId });

    // Add quiz count per topic
    const topicsWithCounts = await Promise.all(
      topics.map(async (topic) => {
        const quizCount = await Quiz.countDocuments({ topicId: topic._id });
        const assignments = await TeacherAssignment.find({ topicId: topic._id }).populate('teacherId', 'name email avatar');
        return {
          ...topic.toJSON(),
          quizCount,
          teachers: assignments.map((a) => a.teacherId),
        };
      })
    );

    res.json({ topics: topicsWithCounts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch topics' });
  }
});

// GET /api/classes/:classId/topics/:topicId
router.get('/:classId/:topicId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await getClassForUser(req.params.classId, req.user!);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const topic = await Topic.findById(req.params.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    if (topic.classId.toString() !== req.params.classId.toString()) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    const quizCount = await Quiz.countDocuments({ topicId: topic._id });
    const assignments = await TeacherAssignment.find({ topicId: topic._id }).populate('teacherId', 'name email avatar');

    res.json({
      topic,
      quizCount,
      teachers: assignments.map((a) => a.teacherId),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch topic' });
  }
});

// PATCH /api/classes/:classId/topics/:topicId
const updateTopicSchema = Joi.object({
  name: Joi.string().min(2).max(200),
  teacherId: Joi.string(), // Assign a teacher to this topic
});

router.patch('/:classId/:topicId', auth, authorize('teacher'), validate(updateTopicSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const { teacherId, ...updates } = req.body;

    const topic = await Topic.findByIdAndUpdate(req.params.topicId, updates, { new: true, runValidators: true });
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    // Handle teacher assignment
    if (teacherId) {
      await TeacherAssignment.findOneAndUpdate(
        { topicId: topic._id, teacherId },
        { teacherId, topicId: topic._id, classId: req.params.classId },
        { upsert: true, new: true }
      );
    }

    res.json({ topic });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update topic' });
  }
});

// DELETE /api/classes/:classId/topics/:topicId — Fix #21: cascade delete
router.delete('/:classId/:topicId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const topic = await Topic.findByIdAndDelete(req.params.topicId);
    if (!topic) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    if (topic.classId.toString() !== req.params.classId.toString()) {
      res.status(404).json({ message: 'Topic not found' });
      return;
    }

    // Cascade delete quizzes and all sub-resources
    const quizzes = await Quiz.find({ topicId: topic._id });
    const quizIds = quizzes.map((q) => q._id);

    if (quizIds.length > 0) {
      const { Attempt } = await import('../models/Attempt.js');
      const { Answer } = await import('../models/Answer.js');
      const { Question } = await import('../models/Question.js');

      const attempts = await Attempt.find({ quizId: { $in: quizIds } });
      const attemptIds = attempts.map((a) => a._id);

      await Answer.deleteMany({ attemptId: { $in: attemptIds } });
      await Attempt.deleteMany({ quizId: { $in: quizIds } });
      await Question.deleteMany({ quizId: { $in: quizIds } });
      await Quiz.deleteMany({ topicId: topic._id });
    }

    await TeacherAssignment.deleteMany({ topicId: topic._id });
    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete topic' });
  }
});

export default router;
