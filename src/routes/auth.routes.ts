import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
};

// POST /api/auth/register
const registerSchema = Joi.object({
  name: Joi.string().required().min(2).max(100),
  email: Joi.string().email().required(),
  password: Joi.string().required().min(6),
  role: Joi.string().valid('teacher', 'student').required(),
});

router.post('/register', validate(registerSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ message: 'Email already registered' });
      return;
    }

    const user = await User.create({ name, email, password, role });
    const token = generateToken(user._id.toString());

    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed' });
  }
});

// POST /api/auth/login
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

router.post('/login', validate(loginSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user._id.toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// POST /api/auth/google
const googleSchema = Joi.object({
  idToken: Joi.string().required(),
  role: Joi.string().valid('teacher', 'student').required(),
});

router.post('/google', validate(googleSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { idToken, role } = req.body;

    // In production, verify with Google's OAuth2Client
    // For dev, we'll accept a mock flow
    let googlePayload: { email: string; name: string; sub: string; picture?: string } | null = null;

    if (env.GOOGLE_CLIENT_ID) {
      const { OAuth2Client } = await import('google-auth-library');
      const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.name || !payload.sub) {
        res.status(401).json({ message: 'Invalid Google token' });
        return;
      }
      googlePayload = { email: payload.email, name: payload.name, sub: payload.sub, picture: payload.picture };
    } else {
      // Dev mode: skip verification
      res.status(501).json({ message: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env' });
      return;
    }

    let user = await User.findOne({ googleId: googlePayload.sub });
    if (!user) {
      user = await User.findOne({ email: googlePayload.email });
      if (user) {
        user.googleId = googlePayload.sub;
        await user.save();
      } else {
        user = await User.create({
          name: googlePayload.name,
          email: googlePayload.email,
          googleId: googlePayload.sub,
          avatar: googlePayload.picture,
          role,
        });
      }
    }

    const token = generateToken(user._id.toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Google authentication failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ user: req.user });
});

// POST /api/auth/logout (client-side token deletion, this is a no-op on server)
router.post('/logout', auth, async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
