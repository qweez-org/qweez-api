import { Router, Response } from 'express';
import Joi from 'joi';
import { Class } from '../models/Class.js';
import { Membership } from '../models/Membership.js';
import { Notification } from '../models/Notification.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { getManageableClassForTeacher } from '../utils/access.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// POST /api/classes/join-requests — student/co-teacher request to join class by code
const joinRequestSchema = Joi.object({
  code: Joi.string().required().length(6).uppercase(),
});

router.post('/', auth, validate(joinRequestSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await Class.findOne({ code: req.body.code.toUpperCase() });
    if (!cls) {
      res.status(404).json({ message: 'Invalid class code' });
      return;
    }

    // Check if already a member
    const existing = await Membership.findOne({ userId: req.user!._id, classId: cls._id });
    if (existing) {
      res.status(409).json({ message: 'Already requested or joined this class', status: existing.status });
      return;
    }

    // Can't join own class
    if (cls.owner.toString() === req.user!._id.toString()) {
      res.status(400).json({ message: 'You are the owner of this class' });
      return;
    }

    const role = req.user!.role === 'teacher' ? 'co-teacher' : 'student';

    const membership = await Membership.create({
      userId: req.user!._id,
      classId: cls._id,
      role,
      status: 'pending',
    });

    // Notify class owner
    await Notification.create({
      userId: cls.owner,
      type: 'join_request',
      title: 'Permintaan bergabung baru',
      message: `${req.user!.name} ingin bergabung ke kelas ${cls.name}`,
      classId: cls._id,
    });

    res.status(201).json({ membership, class: { _id: cls._id, name: cls.name } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit join request' });
  }
});

// GET /api/classes/join-requests — list own join requests
router.get('/', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memberships = await Membership.find({ userId: req.user!._id })
      .populate('classId', 'name code owner')
      .sort({ createdAt: -1 });
    res.json({ joinRequests: memberships });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch join requests' });
  }
});

// GET /api/classes/:classId/join-requests — teacher views join requests for their class
router.get('/:classId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const status = req.query.status as string || undefined;
    const filter: any = { classId: req.params.classId };
    if (status) filter.status = status;

    const memberships = await Membership.find(filter)
      .populate('userId', 'name email avatar role')
      .sort({ createdAt: -1 });

    res.json({ joinRequests: memberships });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch join requests' });
  }
});

// POST /api/classes/:classId/join-requests/:requestId/approve
router.post('/:classId/approve/:requestId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const membership = await Membership.findOneAndUpdate(
      { _id: req.params.requestId, classId: req.params.classId, status: 'pending' },
      { status: 'approved' },
      { new: true }
    ).populate('userId', 'name email');

    if (!membership) {
      res.status(404).json({ message: 'Join request not found or already processed' });
      return;
    }

    // Notify the user
    await Notification.create({
      userId: membership.userId,
      type: 'join_approved',
      title: 'Permintaan bergabung disetujui',
      message: `Anda telah bergabung ke kelas`,
      classId: membership.classId,
    });

    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve request' });
  }
});

// POST /api/classes/:classId/join-requests/:requestId/reject
router.post('/:classId/reject/:requestId', auth, authorize('teacher'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const membership = await Membership.findOneAndUpdate(
      { _id: req.params.requestId, classId: req.params.classId, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );

    if (!membership) {
      res.status(404).json({ message: 'Join request not found or already processed' });
      return;
    }

    await Notification.create({
      userId: membership.userId,
      type: 'join_rejected',
      title: 'Permintaan bergabung ditolak',
      message: `Permintaan bergabung Anda ditolak`,
      classId: membership.classId,
    });

    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject request' });
  }
});

export default router;
