import { describe, it, expect } from 'vitest';
import { request, createTeacher, authHeader } from './helpers.js';

async function setupLiveQuiz(teacherToken: string) {
  const cls = await request.post('/api/classes').set(authHeader(teacherToken)).send({ name: 'Live Class' });
  const classId = cls.body.class._id;
  const topic = await request.post(`/api/classes/topics/${classId}`)
    .set(authHeader(teacherToken))
    .send({ name: 'Live Topic' });
  const quizRes = await request.post(`/api/quizzes/topics/${topic.body.topic._id}`)
    .set(authHeader(teacherToken))
    .send({ title: 'Live Quiz', duration: 30, mode: 'live' });
  const quizId = quizRes.body.quiz._id;

  await request.post(`/api/quizzes/${quizId}/questions`)
    .set(authHeader(teacherToken))
    .send({
      text: 'Live Q?', type: 'multiple_choice',
      options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      points: 10,
    });

  // Set quiz to waiting state for live mode
  await request.patch(`/api/quizzes/${quizId}`)
    .set(authHeader(teacherToken))
    .send({ status: 'waiting' });

  return { classId, quizId };
}

describe('Live Quiz Routes', () => {
  describe('POST /api/quizzes/:quizId/live/start', () => {
    it('teacher starts a live session and gets a PIN', async () => {
      const t = await createTeacher();
      const { quizId } = await setupLiveQuiz(t.accessToken);

      const res = await request.post(`/api/quizzes/${quizId}/live/start`)
        .set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.pin).toBeDefined();
      expect(res.body.pin).toHaveLength(6);
    });
  });

  describe('GET /api/quizzes/:quizId/live/participants', () => {
    it('returns participant list for active session', async () => {
      const t = await createTeacher();
      const { quizId } = await setupLiveQuiz(t.accessToken);

      await request.post(`/api/quizzes/${quizId}/live/start`)
        .set(authHeader(t.accessToken));

      const res = await request.get(`/api/quizzes/${quizId}/live/participants`)
        .set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.participants).toBeDefined();
      expect(Array.isArray(res.body.participants)).toBe(true);
    });
  });

  describe('GET /api/quizzes/:quizId/live/leaderboard', () => {
    it('returns leaderboard for active session', async () => {
      const t = await createTeacher();
      const { quizId } = await setupLiveQuiz(t.accessToken);

      await request.post(`/api/quizzes/${quizId}/live/start`)
        .set(authHeader(t.accessToken));

      const res = await request.get(`/api/quizzes/${quizId}/live/leaderboard`)
        .set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.leaderboard).toBeDefined();
    });
  });

  describe('POST /api/quizzes/:quizId/live/cancel', () => {
    it('teacher cancels a live session', async () => {
      const t = await createTeacher();
      const { quizId } = await setupLiveQuiz(t.accessToken);

      await request.post(`/api/quizzes/${quizId}/live/start`)
        .set(authHeader(t.accessToken));

      const res = await request.post(`/api/quizzes/${quizId}/live/cancel`)
        .set(authHeader(t.accessToken));
      expect(res.status).toBe(200);

      // Participants should now return 404
      const check = await request.get(`/api/quizzes/${quizId}/live/participants`)
        .set(authHeader(t.accessToken));
      expect(check.status).toBe(404);
    });
  });
});
