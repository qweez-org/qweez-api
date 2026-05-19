import { describe, it, expect } from 'vitest';
import { request, createTeacher, authHeader } from './helpers.js';

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new teacher', async () => {
      const res = await request.post('/api/auth/register').send({
        name: 'Teacher One',
        email: 'teacher1@test.com',
        password: 'password123',
        role: 'teacher',
      });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.role).toBe('teacher');
    });

    it('rejects duplicate email+role', async () => {
      await request.post('/api/auth/register').send({
        name: 'T1', email: 'dup@test.com', password: 'password123', role: 'teacher',
      });
      const res = await request.post('/api/auth/register').send({
        name: 'T2', email: 'dup@test.com', password: 'password123', role: 'teacher',
      });
      expect(res.status).toBe(409);
    });

    it('rejects invalid body', async () => {
      const res = await request.post('/api/auth/register').send({ name: 'X' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const teacher = await createTeacher({ email: 'login@test.com' });
      const res = await request.post('/api/auth/login').send({
        email: 'login@test.com', password: 'password123', role: 'teacher',
      });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rejects wrong password', async () => {
      await createTeacher({ email: 'wrong@test.com' });
      const res = await request.post('/api/auth/login').send({
        email: 'wrong@test.com', password: 'badpass', role: 'teacher',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user with valid token', async () => {
      const teacher = await createTeacher();
      const res = await request.get('/api/auth/me').set(authHeader(teacher.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBeDefined();
    });

    it('rejects without token', async () => {
      const res = await request.get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates refresh token', async () => {
      const teacher = await createTeacher();
      const res = await request.post('/api/auth/refresh').send({
        refreshToken: teacher.refreshToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('rejects reused (revoked) refresh token', async () => {
      const teacher = await createTeacher();
      // Use it once
      await request.post('/api/auth/refresh').send({ refreshToken: teacher.refreshToken });
      // Try again — should be revoked
      const res = await request.post('/api/auth/refresh').send({ refreshToken: teacher.refreshToken });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logs out and invalidates access tokens', async () => {
      const teacher = await createTeacher();
      const logoutRes = await request.post('/api/auth/logout')
        .set(authHeader(teacher.accessToken))
        .send({ refreshToken: teacher.refreshToken });
      expect(logoutRes.status).toBe(200);

      // Old access token should be revoked
      const meRes = await request.get('/api/auth/me').set(authHeader(teacher.accessToken));
      expect(meRes.status).toBe(401);
    });
  });
});
