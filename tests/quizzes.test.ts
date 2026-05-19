import { describe, it, expect } from 'vitest';
import { request, createTeacher, authHeader } from './helpers.js';

async function createClassAndTopic(token: string) {
  const cls = await request.post('/api/classes').set(authHeader(token)).send({ name: 'Quiz Class' });
  const classId = cls.body.class._id;
  const topic = await request.post(`/api/classes/topics/${classId}`)
    .set(authHeader(token))
    .send({ name: 'Topic 1' });
  return { classId, topicId: topic.body.topic._id };
}

describe('Quiz Routes', () => {
  describe('POST /api/quizzes/topics/:topicId', () => {
    it('teacher creates a quiz', async () => {
      const t = await createTeacher();
      const { topicId } = await createClassAndTopic(t.accessToken);
      const res = await request.post(`/api/quizzes/topics/${topicId}`)
        .set(authHeader(t.accessToken))
        .send({ title: 'Quiz 1', duration: 30, mode: 'manual' });
      expect(res.status).toBe(201);
      expect(res.body.quiz.title).toBe('Quiz 1');
    });
  });

  describe('Question CRUD', () => {
    it('adds a question to a quiz', async () => {
      const t = await createTeacher();
      const { topicId } = await createClassAndTopic(t.accessToken);
      const quizRes = await request.post(`/api/quizzes/topics/${topicId}`)
        .set(authHeader(t.accessToken))
        .send({ title: 'Q Quiz', duration: 30, mode: 'manual' });

      const res = await request.post(`/api/quizzes/${quizRes.body.quiz._id}/questions`)
        .set(authHeader(t.accessToken))
        .send({
          text: 'What is 2+2?',
          type: 'multiple_choice',
          options: [
            { text: '3', isCorrect: false },
            { text: '4', isCorrect: true },
            { text: '5', isCorrect: false },
          ],
          points: 10,
        });
      expect(res.status).toBe(201);
    });
  });

  describe('Quiz status', () => {
    it('updates quiz status via PATCH', async () => {
      const t = await createTeacher();
      const { topicId } = await createClassAndTopic(t.accessToken);
      const quizRes = await request.post(`/api/quizzes/topics/${topicId}`)
        .set(authHeader(t.accessToken))
        .send({ title: 'Status Quiz', duration: 30, mode: 'manual' });
      const quizId = quizRes.body.quiz._id;

      // Open it
      const open = await request.patch(`/api/quizzes/${quizId}`)
        .set(authHeader(t.accessToken))
        .send({ status: 'open' });
      expect(open.status).toBe(200);
      expect(open.body.quiz.status).toBe('open');

      // Close it
      const close = await request.patch(`/api/quizzes/${quizId}`)
        .set(authHeader(t.accessToken))
        .send({ status: 'closed' });
      expect(close.status).toBe(200);
      expect(close.body.quiz.status).toBe('closed');
    });
  });

  describe('DELETE /api/quizzes/:id', () => {
    it('deletes a quiz', async () => {
      const t = await createTeacher();
      const { topicId } = await createClassAndTopic(t.accessToken);
      const quizRes = await request.post(`/api/quizzes/topics/${topicId}`)
        .set(authHeader(t.accessToken))
        .send({ title: 'Del Quiz', duration: 30, mode: 'manual' });

      const res = await request.delete(`/api/quizzes/${quizRes.body.quiz._id}`)
        .set(authHeader(t.accessToken));
      expect(res.status).toBe(200);
    });
  });
});
