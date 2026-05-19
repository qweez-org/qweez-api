import { describe, it, expect } from 'vitest';
import { request, createTeacher, createStudent, authHeader } from './helpers.js';
import { Membership } from '../src/models/Membership.js';

async function setupQuizWithQuestion(teacherToken: string) {
  const cls = await request.post('/api/classes').set(authHeader(teacherToken)).send({ name: 'Attempt Class' });
  const classId = cls.body.class._id;
  const classCode = cls.body.class.code;
  const topic = await request.post(`/api/classes/topics/${classId}`)
    .set(authHeader(teacherToken))
    .send({ name: 'Topic' });
  const quizRes = await request.post(`/api/quizzes/topics/${topic.body.topic._id}`)
    .set(authHeader(teacherToken))
    .send({ title: 'Attempt Quiz', duration: 30, mode: 'manual' });
  const quizId = quizRes.body.quiz._id;

  await request.post(`/api/quizzes/${quizId}/questions`)
    .set(authHeader(teacherToken))
    .send({
      text: 'What is 1+1?', type: 'multiple_choice',
      options: [{ text: '2', isCorrect: true }, { text: '3', isCorrect: false }],
      points: 10,
    });

  // Open the quiz via status update
  await request.patch(`/api/quizzes/${quizId}`)
    .set(authHeader(teacherToken))
    .send({ status: 'open' });

  return { classId, classCode, quizId };
}

async function enrollStudent(studentUserId: string, classId: string) {
  // Directly create approved membership for test simplicity
  await Membership.create({ userId: studentUserId, classId, role: 'student', status: 'approved' });
}

describe('Attempt Routes', () => {
  describe('POST /api/attempts/quizzes/:quizId/start', () => {
    it('student starts a quiz attempt', async () => {
      const t = await createTeacher();
      const s = await createStudent();
      const { classId, quizId } = await setupQuizWithQuestion(t.accessToken);
      await enrollStudent(s.user._id, classId);

      const res = await request.post(`/api/attempts/quizzes/${quizId}/start`)
        .set(authHeader(s.accessToken));
      expect(res.status).toBe(201);
      expect(res.body.attempt).toBeDefined();
      expect(res.body.attempt.status).toBe('in_progress');
    });
  });

  describe('POST /api/attempts/:attemptId/submit', () => {
    it('student submits and gets scored', async () => {
      const t = await createTeacher();
      const s = await createStudent();
      const { classId, quizId } = await setupQuizWithQuestion(t.accessToken);
      await enrollStudent(s.user._id, classId);

      const start = await request.post(`/api/attempts/quizzes/${quizId}/start`)
        .set(authHeader(s.accessToken));
      const attemptId = start.body.attempt._id;

      // Get questions
      const questions = await request.get(`/api/quizzes/${quizId}/questions`)
        .set(authHeader(s.accessToken));

      if (questions.body.questions && questions.body.questions.length > 0) {
        // Save answer
        await request.post(`/api/attempts/${attemptId}/answers`)
          .set(authHeader(s.accessToken))
          .send({ questionId: questions.body.questions[0]._id, answer: '2' });
      }

      // Submit
      const res = await request.post(`/api/attempts/${attemptId}/submit`)
        .set(authHeader(s.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.attempt.status).toBe('submitted');
    });
  });
});
