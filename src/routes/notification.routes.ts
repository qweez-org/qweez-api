import { Router, Response } from 'express';
import { Notification } from '../models/Notification.js';
import { auth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await Notification.find({ userId: req.user!._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ userId: req.user!._id, isRead: false });

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!._id },
      { isRead: true }
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

export default router;
