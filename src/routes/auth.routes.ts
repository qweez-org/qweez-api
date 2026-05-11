import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { generateAccessToken, generateJti, generateRefreshToken, hashToken } from '../utils/tokens.js';
import { getCookieValue } from '../utils/cookies.js';

const router = Router();

const wantsCookieRefresh = (req: AuthRequest): boolean => {
  const header = (req.headers['x-refresh-cookie'] || '').toString();
  return header === '1' || header.toLowerCase() === 'true';
};

const setRefreshCookie = (res: Response, refreshToken: string): void => {
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.REFRESH_TOKEN_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: maxAgeMs,
  });
};

const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, {
    path: '/api/auth/refresh',
  });
};

async function issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string; refreshJti: string }> {
  const accessToken = generateAccessToken(userId);
  const refreshJti = generateJti();
  const refreshToken = generateRefreshToken(userId, refreshJti);

  const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    userId,
    jti: refreshJti,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken, refreshJti };
}

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

    const existingUser = await User.findOne({ email, role });
    if (existingUser) {
      res.status(409).json({ message: 'Account already exists for this email and role' });
      return;
    }

    const user = await User.create({ name, email, password, role });
    const { accessToken, refreshToken } = await issueTokens(user._id.toString());

    if (wantsCookieRefresh(req)) {
      setRefreshCookie(res, refreshToken);
      res.status(201).json({ accessToken, user });
      return;
    }

    res.status(201).json({ accessToken, refreshToken, user });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed' });
  }
});

// POST /api/auth/login
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  role: Joi.string().valid('teacher', 'student').required(),
});

router.post('/login', validate(loginSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, role } = req.body;

    const user = await User.findOne({ email, role }).select('+password');
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const { accessToken, refreshToken } = await issueTokens(user._id.toString());

    if (wantsCookieRefresh(req)) {
      setRefreshCookie(res, refreshToken);
      res.json({ accessToken, user });
      return;
    }

    res.json({ accessToken, refreshToken, user });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ user: req.user });
});

// POST /api/auth/refresh
const refreshSchema = Joi.object({
  refreshToken: Joi.string().optional(),
});

router.post('/refresh', validate(refreshSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cookieToken = getCookieValue(req.headers.cookie, env.REFRESH_TOKEN_COOKIE_NAME);
    const provided = (req.body?.refreshToken as string | undefined) || cookieToken;

    if (!provided) {
      res.status(401).json({ message: 'Refresh token required' });
      return;
    }

    const decoded = jwt.verify(provided, env.JWT_SECRET) as { userId: string; jti: string; type?: string };
    if (decoded.type !== 'refresh') {
      res.status(401).json({ message: 'Invalid token type' });
      return;
    }

    const tokenDoc = await RefreshToken.findOne({ jti: decoded.jti, userId: decoded.userId });
    if (!tokenDoc) {
      clearRefreshCookie(res);
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }

    if (tokenDoc.revokedAt) {
      clearRefreshCookie(res);
      res.status(401).json({ message: 'Refresh token revoked' });
      return;
    }

    if (tokenDoc.expiresAt.getTime() <= Date.now()) {
      tokenDoc.revokedAt = new Date();
      await tokenDoc.save();
      clearRefreshCookie(res);
      res.status(401).json({ message: 'Refresh token expired' });
      return;
    }

    if (tokenDoc.tokenHash !== hashToken(provided)) {
      tokenDoc.revokedAt = new Date();
      await tokenDoc.save();
      clearRefreshCookie(res);
      res.status(401).json({ message: 'Refresh token invalid' });
      return;
    }

    // Rotate: revoke old, issue new
    const { accessToken, refreshToken: newRefresh, refreshJti: newJti } = await issueTokens(decoded.userId);
    tokenDoc.revokedAt = new Date();
    tokenDoc.replacedByJti = newJti;
    await tokenDoc.save();

    if (cookieToken) {
      setRefreshCookie(res, newRefresh);
      res.json({ accessToken });
      return;
    }

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
const logoutSchema = Joi.object({
  refreshToken: Joi.string().optional(),
});

router.post('/logout', auth, validate(logoutSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cookieToken = getCookieValue(req.headers.cookie, env.REFRESH_TOKEN_COOKIE_NAME);
    const provided = (req.body?.refreshToken as string | undefined) || cookieToken;

    if (provided) {
      try {
        const decoded = jwt.verify(provided, env.JWT_SECRET) as { userId: string; jti: string; type?: string };
        if (decoded.type === 'refresh') {
          await RefreshToken.updateOne(
            { jti: decoded.jti, userId: decoded.userId, revokedAt: { $exists: false } },
            { $set: { revokedAt: new Date() } }
          );
        }
      } catch (_) {
        // ignore
      }
    }
    clearRefreshCookie(res);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Logout failed' });
  }
});

export default router;
