import { Router, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import Joi from 'joi';
import { User } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
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
      await RefreshToken.updateMany({ userId: decoded.userId }, { $set: { revokedAt: new Date() } });
      clearRefreshCookie(res);
      res.status(401).json({ message: 'Refresh token revoked (session terminated)' });
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

router.post('/logout', auth, validate(logoutSchema), async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
      } catch (err) {
        // ignore verify error
      }
    }

    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { tokenInvalidatedAt: new Date() });
    }

    clearRefreshCookie(res);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// ── Password Reset Flow (dev-only: token logged to console) ─────────────
const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

router.post('/forgot-password', validate(forgotPasswordSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user) {
      // Do not reveal whether email exists
      res.json({ message: 'If an account exists, a reset link has been sent.' });
      return;
    }

    // Delete any previous token for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcryptjs.hash(rawToken, 10);

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    const resetUrl = `${env.NODE_ENV === 'development' ? 'http://localhost:5173' : env.CORS_ORIGIN.split(',')[0]}/reset-password?token=${rawToken}&userId=${user._id}`;

    // ── DEV-ONLY: log token to console instead of sending email ──────────
    if (env.NODE_ENV === 'development') {
      console.log(`\n🔐 Password Reset Token (dev-only console log):`);
      console.log(`   User: ${user.email}`);
      console.log(`   URL:  ${resetUrl}`);
      console.log(`   Expires in 1 hour\n`);
    }

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process request' });
  }
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required().length(64),
  userId: Joi.string().required(),
  password: Joi.string().required().min(6),
});

router.post('/reset-password', validate(resetPasswordSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, userId, password } = req.body;

    const resetRecord = await PasswordResetToken.findOne({ userId });
    if (!resetRecord) {
      res.status(400).json({ message: 'Invalid or expired token' });
      return;
    }

    const isValid = await bcryptjs.compare(token, resetRecord.tokenHash);
    if (!isValid || resetRecord.expiresAt < new Date()) {
      res.status(400).json({ message: 'Invalid or expired token' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(400).json({ message: 'User not found' });
      return;
    }

    const hashed = await bcryptjs.hash(password, 12);
    await User.findByIdAndUpdate(userId, { password: hashed, tokenInvalidatedAt: new Date() });

    // Clean up token
    await PasswordResetToken.deleteOne({ _id: resetRecord._id });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

export default router;
