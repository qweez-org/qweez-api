import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessTokenPayload = { userId: string; type: 'access' };
export type RefreshTokenPayload = { userId: string; jti: string; type: 'refresh' };

export function generateAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { userId, type: 'access' };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions);
}

export function generateRefreshToken(userId: string, jti: string): string {
  const payload: RefreshTokenPayload = { userId, jti, type: 'refresh' };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateJti(): string {
  return crypto.randomBytes(16).toString('hex');
}
