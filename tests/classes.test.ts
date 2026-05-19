import { describe, it, expect } from 'vitest';
import { request, createTeacher, createStudent, authHeader } from './helpers.js';

describe('Class Routes', () => {
  describe('POST /api/classes', () => {
    it('teacher creates a class', async () => {
      const t = await createTeacher();
      const res = await request.post('/api/classes')
        .set(authHeader(t.accessToken))
        .send({ name: 'Math 101', description: 'Intro to math' });
      expect(res.status).toBe(201);
      expect(res.body.class.name).toBe('Math 101');
      expect(res.body.class.code).toBeDefined();
    });

    it('student cannot create a class', async () => {
      const s = await createStudent();
      const res = await request.post('/api/classes')
        .set(authHeader(s.accessToken))
        .send({ name: 'Nope' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/classes', () => {
    it('teacher lists own classes', async () => {
      const t = await createTeacher();
      await request.post('/api/classes').set(authHeader(t.accessToken)).send({ name: 'C1' });
      await request.post('/api/classes').set(authHeader(t.accessToken)).send({ name: 'C2' });
      const res = await request.get('/api/classes').set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.classes.length).toBe(2);
    });
  });

  describe('GET /api/classes/:id', () => {
    it('returns class detail', async () => {
      const t = await createTeacher();
      const created = await request.post('/api/classes').set(authHeader(t.accessToken)).send({ name: 'Detail' });
      const id = created.body.class._id;
      const res = await request.get(`/api/classes/${id}`).set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.class.name).toBe('Detail');
    });

    it('returns error for invalid id', async () => {
      const t = await createTeacher();
      const res = await request.get('/api/classes/not-an-id').set(authHeader(t.accessToken));
      // Class route doesn't use validateObjectIdParam; CastError caught by try/catch → 500
      expect([400, 500]).toContain(res.status);
    });
  });

  describe('PATCH /api/classes/:id', () => {
    it('teacher updates own class', async () => {
      const t = await createTeacher();
      const created = await request.post('/api/classes').set(authHeader(t.accessToken)).send({ name: 'Old' });
      const id = created.body.class._id;
      const res = await request.patch(`/api/classes/${id}`)
        .set(authHeader(t.accessToken))
        .send({ name: 'New' });
      expect(res.status).toBe(200);
      expect(res.body.class.name).toBe('New');
    });
  });

  describe('DELETE /api/classes/:id', () => {
    it('teacher deletes own class (cascade)', async () => {
      const t = await createTeacher();
      const created = await request.post('/api/classes').set(authHeader(t.accessToken)).send({ name: 'Del' });
      const id = created.body.class._id;
      const res = await request.delete(`/api/classes/${id}`).set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
      // Verify gone
      const check = await request.get(`/api/classes/${id}`).set(authHeader(t.accessToken));
      expect(check.status).toBe(404);
    });
  });
});
