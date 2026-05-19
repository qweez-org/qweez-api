import supertest from 'supertest';
import { app } from '../src/server.js';

export const request = supertest(app);

export async function createTeacher(overrides: Record<string, string> = {}) {
  const data = {
    name: overrides.name || 'Test Teacher',
    email: overrides.email || `teacher-${Date.now()}@test.com`,
    password: overrides.password || 'password123',
    role: 'teacher',
  };
  const res = await request.post('/api/auth/register').send(data);
  return { ...res.body, email: data.email, password: data.password };
}

export async function createStudent(overrides: Record<string, string> = {}) {
  const data = {
    name: overrides.name || 'Test Student',
    email: overrides.email || `student-${Date.now()}@test.com`,
    password: overrides.password || 'password123',
    role: 'student',
  };
  const res = await request.post('/api/auth/register').send(data);
  return { ...res.body, email: data.email, password: data.password };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
