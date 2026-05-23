import { Router, Response } from 'express';
import Joi from 'joi';
import { User } from '../models/User.js';
import { Class } from '../models/Class.js';
import { Membership } from '../models/Membership.js';
import { Notification } from '../models/Notification.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// POST /api/classes/:classId/co-teachers — Invite co-teacher by email
const inviteSchema = Joi.object({
  email: Joi.string().email().required(),
});

router.post('/:classId/co-teachers', auth, authorize('teacher'), validate(inviteSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    // Only class owner can invite co-teachers
    if (cls.owner.toString() !== req.user!._id.toString()) {
      res.status(403).json({ message: 'Only the class owner can invite co-teachers' });
      return;
    }

    const teacher = await User.findOne({ email: req.body.email, role: 'teacher' });
    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found with that email' });
      return;
    }

    if (teacher._id.toString() === req.user!._id.toString()) {
      res.status(400).json({ message: 'Cannot invite yourself as co-teacher' });
      return;
    }

    // Check if already a member
    const existing = await Membership.findOne({ userId: teacher._id, classId: cls._id });
    if (existing) {
      res.status(409).json({ message: 'Teacher is already a member of this class' });
      return;
    }

    const membership = await Membership.create({
      userId: teacher._id,
      classId: cls._id,
      role: 'co-teacher',
      status: 'pending',
    });

    await Notification.create({
      userId: teacher._id,
      type: 'co_teacher_invite',
      title: 'Undangan Co-Teacher',
      message: `${req.user!.name} mengundang Anda sebagai co-teacher di kelas "${cls.name}".`,
      classId: cls._id,
    });

    res.status(201).json({ membership, teacher: { _id: teacher._id, name: teacher.name, email: teacher.email } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to invite co-teacher' });
  }
});

// POST /api/classes/:classId/co-teachers/accept — Accept co-teacher invitation
router.post('/:classId/co-teachers/accept', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const membership = await Membership.findOneAndUpdate(
      { userId: req.user!._id, classId: cls._id, role: 'co-teacher', status: 'pending' },
      { status: 'approved' },
      { new: true }
    );

    if (!membership) {
      res.status(404).json({ message: 'Pending invitation not found' });
      return;
    }

    await Notification.create({
      userId: cls.owner,
      type: 'co_teacher_accepted',
      title: 'Undangan Diterima',
      message: `${req.user!.name} telah menerima undangan co-teacher di kelas "${cls.name}".`,
      classId: cls._id,
    });

    // Mark notification as read for the user who accepted
    await Notification.updateMany(
      { userId: req.user!._id, type: 'co_teacher_invite', classId: cls._id },
      { isRead: true }
    );

    res.json({ message: 'Invitation accepted', membership });
  } catch (error) {
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

// POST /api/classes/:classId/co-teachers/reject — Reject co-teacher invitation
router.post('/:classId/co-teachers/reject', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const membership = await Membership.findOneAndDelete({
      userId: req.user!._id, classId: cls._id, role: 'co-teacher', status: 'pending'
    });

    if (!membership) {
      res.status(404).json({ message: 'Pending invitation not found' });
      return;
    }

    await Notification.create({
      userId: cls.owner,
      type: 'co_teacher_rejected',
      title: 'Undangan Ditolak',
      message: `${req.user!.name} menolak undangan co-teacher di kelas "${cls.name}".`,
      classId: cls._id,
    });

    // Mark notification as read for the user who rejected
    await Notification.updateMany(
      { userId: req.user!._id, type: 'co_teacher_invite', classId: cls._id },
      { isRead: true }
    );

    res.json({ message: 'Invitation rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject invitation' });
  }
});

// DELETE /api/classes/:classId/co-teachers/:teacherId — Remove co-teacher
router.delete('/:classId/co-teachers/:teacherId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    if (cls.owner.toString() !== req.user!._id.toString()) {
      res.status(403).json({ message: 'Only the class owner can remove co-teachers' });
      return;
    }

    const membership = await Membership.findOneAndDelete({
      userId: req.params.teacherId,
      classId: cls._id,
      role: 'co-teacher',
    });

    if (!membership) {
      res.status(404).json({ message: 'Co-teacher membership not found' });
      return;
    }

    res.json({ message: 'Co-teacher removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove co-teacher' });
  }
});

export default router;
