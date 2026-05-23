import { Router, Response } from 'express';
import { Membership } from '../models/Membership.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { getClassForUser, getManageableClassForTeacher } from '../utils/access.js';

const router = Router();

// GET /api/classes/:classId/members
router.get('/:classId', auth, validateObjectIdParam('classId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cls = await getClassForUser(req.params.classId, req.user!);
    if (!cls) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const members = await Membership.find({
      classId: req.params.classId,
      $or: [
        { status: 'approved' },
        { status: 'pending', role: 'co-teacher' }
      ]
    }).populate('userId', 'name email avatar role');

    res.json({ members });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch members' });
  }
});

// DELETE /api/classes/:classId/members/:memberId
router.delete('/:classId/:memberId', auth, authorize('teacher'), validateObjectIdParam('classId'), validateObjectIdParam('memberId'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manageable = await getManageableClassForTeacher(req.params.classId, req.user!);
    if (!manageable) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    const membership = await Membership.findOneAndDelete({
      _id: req.params.memberId,
      classId: req.params.classId,
    });

    if (!membership) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

export default router;
