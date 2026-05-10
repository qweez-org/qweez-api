import { Router, Response } from 'express';
import Joi from 'joi';
import { User } from '../models/User.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// GET /api/users/:id
router.get('/:id', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!._id.toString() !== req.params.id.toString()) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const user = await User.findById(req.params.id).select('name email role avatar');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// PATCH /api/users/me
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  avatar: Joi.string().uri().allow(''),
});

router.patch('/me', auth, validate(updateProfileSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.user!._id, updates, { new: true, runValidators: true });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

export default router;
