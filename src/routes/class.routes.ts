import { Router, Response } from 'express';
import Joi from 'joi';
import { Class } from '../models/Class.js';
import { Membership } from '../models/Membership.js';
import { Topic } from '../models/Topic.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { generateClassCode } from '../utils/generateCode.js';
import { getClassForUser } from '../utils/access.js';

const router = Router();

// POST /api/classes
const createClassSchema = Joi.object({
  name: Joi.string().required().min(2).max(200),
  description: Joi.string().max(500).allow(''),
});

router.post('/', auth, authorize('teacher'), validate(createClassSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let code = generateClassCode();
    // Ensure unique code
    while (await Class.findOne({ code })) {
      code = generateClassCode();
    }

    const cls = await Class.create({
      name: req.body.name,
      description: req.body.description,
      code,
      owner: req.user!._id,
    });

    res.status(201).json({ class: cls });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create class' });
  }
});

// GET /api/classes
router.get('/', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'teacher') {
      // Teacher: classes they own + classes they co-teach
      const ownedClasses = await Class.find({ owner: req.user!._id }).populate('owner', 'name email avatar');

      const coTeachMemberships = await Membership.find({
        userId: req.user!._id,
        role: 'co-teacher',
        status: 'approved',
      });
      const coTeachClassIds = coTeachMemberships.map((m) => m.classId);
      const coTeachClasses = await Class.find({ _id: { $in: coTeachClassIds } }).populate('owner', 'name email avatar');

      res.json({ classes: [...ownedClasses, ...coTeachClasses] });
    } else {
      // Student: classes they're members of
      const memberships = await Membership.find({ userId: req.user!._id, role: 'student' });
      const classIds = memberships.map((m) => m.classId);
      const classes = await Class.find({ _id: { $in: classIds } }).populate('owner', 'name email avatar');

      // Add membership status to each class
      const classesWithStatus = classes.map((cls) => {
        const membership = memberships.find((m) => m.classId.toString() === cls._id.toString());
        return { ...cls.toJSON(), membershipStatus: membership?.status };
      });

      res.json({ classes: classesWithStatus });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
});

// GET /api/classes/:classId
router.get('/:classId', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await getClassForUser(req.params.classId, req.user!);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    await cls.populate('owner', 'name email avatar');

    const memberCount = await Membership.countDocuments({ classId: cls._id, status: 'approved', role: 'student' });
    const topicCount = await Topic.countDocuments({ classId: cls._id });
    const pendingCount = await Membership.countDocuments({ classId: cls._id, status: 'pending' });

    res.json({
      class: cls,
      stats: { memberCount, topicCount, pendingCount },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch class' });
  }
});

// PATCH /api/classes/:classId
const updateClassSchema = Joi.object({
  name: Joi.string().min(2).max(200),
  description: Joi.string().max(500).allow(''),
});

router.patch('/:classId', auth, authorize('teacher'), validate(updateClassSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findOneAndUpdate(
      { _id: req.params.classId, owner: req.user!._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!cls) {
      res.status(404).json({ message: 'Class not found or unauthorized' });
      return;
    }
    res.json({ class: cls });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update class' });
  }
});

// DELETE /api/classes/:classId — Fix #20: full cascade delete
router.delete('/:classId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findOneAndDelete({ _id: req.params.classId, owner: req.user!._id });
    if (!cls) {
      res.status(404).json({ message: 'Class not found or unauthorized' });
      return;
    }

    // Get all topics in the class
    const topics = await Topic.find({ classId: cls._id });
    const topicIds = topics.map((t) => t._id);

    // Get all quizzes under those topics
    const { Quiz } = await import('../models/Quiz.js');
    const { Question } = await import('../models/Question.js');
    const { Attempt } = await import('../models/Attempt.js');
    const { Answer } = await import('../models/Answer.js');
    const { TeacherAssignment } = await import('../models/TeacherAssignment.js');
    const { Notification } = await import('../models/Notification.js');

    const quizzes = await Quiz.find({ topicId: { $in: topicIds } });
    const quizIds = quizzes.map((q) => q._id);

    // Get all attempts under those quizzes
    const attempts = await Attempt.find({ quizId: { $in: quizIds } });
    const attemptIds = attempts.map((a) => a._id);

    // Cascade delete (bottom-up)
    await Answer.deleteMany({ attemptId: { $in: attemptIds } });
    await Attempt.deleteMany({ quizId: { $in: quizIds } });
    await Question.deleteMany({ quizId: { $in: quizIds } });
    await Quiz.deleteMany({ topicId: { $in: topicIds } });
    await TeacherAssignment.deleteMany({ classId: cls._id });
    await Notification.deleteMany({ classId: cls._id });
    await Membership.deleteMany({ classId: cls._id });
    await Topic.deleteMany({ classId: cls._id });

    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete class' });
  }
});

// POST /api/classes/:classId/code — regenerate class code
router.post('/:classId/code', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let code = generateClassCode();
    while (await Class.findOne({ code })) {
      code = generateClassCode();
    }

    const cls = await Class.findOneAndUpdate(
      { _id: req.params.classId, owner: req.user!._id },
      { code },
      { new: true }
    );
    if (!cls) {
      res.status(404).json({ message: 'Class not found or unauthorized' });
      return;
    }
    res.json({ class: cls });
  } catch (error) {
    res.status(500).json({ message: 'Failed to regenerate class code' });
  }
});

// POST /api/classes/:classId/leave
router.post('/:classId/leave', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await Membership.findOneAndDelete({
      userId: req.user!._id,
      classId: req.params.classId,
    });
    if (!membership) {
      res.status(404).json({ message: 'Membership not found' });
      return;
    }
    res.json({ message: 'Left class successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave class' });
  }
});

export default router;
