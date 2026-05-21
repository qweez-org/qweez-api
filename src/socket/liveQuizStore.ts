import crypto from 'crypto';
import { IQuestion } from '../models/Question.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';
import { getRedisClient } from '../config/redis.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  connected: boolean;
}

export interface StudentAnswer {
  answer: string;
  timeMs: number;
  correct: boolean;
  points: number;
}

export interface LiveSession {
  sessionId: string;
  pin: string;
  quizId: string;
  classId: string;
  teacherSocketId: string | null;
  teacherUserId: string;
  status: 'waiting' | 'active' | 'finished';
  participants: Participant[];
  questions: IQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, Record<number, StudentAnswer>>;
  createdAt: string; // ISO string (serialisable)
  finishCount: number;
  totalDurationSec: number;
  // endTimer is NOT stored — managed locally per instance
}

// ─── Redis Key Helpers ──────────────────────────────────────────────────────

const SESSION_KEY   = (pin: string) => `live_session:${pin}`;
const QUIZ_PIN_KEY  = (quizId: string) => `live_quiz_to_pin:${quizId}`;
const SESSION_TTL   = 4 * 60 * 60; // 4 hours in seconds

// ─── In-Memory Fallback (no Redis) ──────────────────────────────────────────

const memSessions   = new Map<string, LiveSession>();
const memQuizToPin  = new Map<string, string>();

// ─── Local Timer Map (always in-memory, never in Redis) ─────────────────────
// Maps pin -> NodeJS.Timeout for the quiz end timer.
const endTimers = new Map<string, NodeJS.Timeout>();

export function getEndTimer(pin: string): NodeJS.Timeout | undefined {
  return endTimers.get(pin);
}

export function setEndTimer(pin: string, timer: NodeJS.Timeout): void {
  endTimers.set(pin, timer);
}

export function clearEndTimer(pin: string): void {
  const timer = endTimers.get(pin);
  if (timer) {
    clearTimeout(timer);
    endTimers.delete(pin);
  }
}

// ─── Session CRUD ───────────────────────────────────────────────────────────

export async function getSessionByPin(pin: string): Promise<LiveSession | undefined> {
  const redis = getRedisClient();
  if (!redis) return memSessions.get(pin);

  const raw = await redis.get(SESSION_KEY(pin));
  if (!raw) return undefined;
  return JSON.parse(raw) as LiveSession;
}

export async function getSessionByQuizId(quizId: string): Promise<LiveSession | undefined> {
  const redis = getRedisClient();
  if (!redis) {
    const pin = memQuizToPin.get(quizId);
    if (!pin) return undefined;
    return memSessions.get(pin);
  }

  const pin = await redis.get(QUIZ_PIN_KEY(quizId));
  if (!pin) return undefined;
  return getSessionByPin(pin);
}

export async function saveSession(pin: string, session: LiveSession): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    memSessions.set(pin, session);
    return;
  }

  await redis.set(SESSION_KEY(pin), JSON.stringify(session), { EX: SESSION_TTL });
}

export async function deleteSession(pin: string, quizId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    memSessions.delete(pin);
    memQuizToPin.delete(quizId);
    return;
  }

  await redis.del(SESSION_KEY(pin));
  await redis.del(QUIZ_PIN_KEY(quizId));
}

// ─── PIN Generation ─────────────────────────────────────────────────────────

async function generatePin(): Promise<string> {
  const redis = getRedisClient();
  let pin: string;
  do {
    pin = crypto.randomInt(100000, 999999).toString();
    if (redis) {
      // Check Redis for collision
      const exists = await redis.exists(SESSION_KEY(pin));
      if (!exists) return pin;
    } else {
      if (!memSessions.has(pin)) return pin;
    }
  } while (true);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function createLiveSession(
  quizId: string,
  teacherUserId: string
): Promise<{ pin: string; sessionId: string; questionCount: number }> {
  // Check for an existing active session for this quiz
  const existing = await getSessionByQuizId(quizId);
  if (existing && existing.status !== 'finished') {
    return { pin: existing.pin, sessionId: existing.sessionId, questionCount: existing.questions.length };
  }
  // Clean up finished session if lingering
  if (existing) {
    await deleteSession(existing.pin, quizId);
  }

  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw new Error('Quiz not found');

  const topic = await Topic.findById(quiz.topicId);
  if (!topic) throw new Error('Topic not found');

  const { Question } = await import('../models/Question.js');
  const questions = await Question.find({ quizId }).sort({ order: 1 });
  if (questions.length === 0) throw new Error('Quiz has no questions');

  const pin = await generatePin();
  const sessionId = crypto.randomUUID();

  const session: LiveSession = {
    sessionId,
    pin,
    quizId,
    classId: topic.classId.toString(),
    teacherSocketId: null,
    teacherUserId,
    status: 'waiting',
    participants: [],
    questions,
    currentQuestionIndex: -1,
    answers: {},
    createdAt: new Date().toISOString(),
    finishCount: 0,
    totalDurationSec: 0,
  };

  await saveSession(pin, session);

  // Set quiz-to-pin mapping
  const redis = getRedisClient();
  if (redis) {
    await redis.set(QUIZ_PIN_KEY(quizId), pin, { EX: SESSION_TTL });
  } else {
    memQuizToPin.set(quizId, pin);
  }

  quiz.status = 'waiting';
  quiz.mode = 'live';
  await quiz.save();

  return { pin, sessionId, questionCount: questions.length };
}

export async function cancelLiveSession(quizId: string, io?: import('socket.io').Server): Promise<void> {
  const session = await getSessionByQuizId(quizId);
  if (!session) return;

  console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[33mSession cancelled\x1b[0m \x1b[1m${session.pin}\x1b[0m`);
  io?.to(`live:${session.pin}`).emit('session_cancelled', { reason: 'Teacher cancelled the session' });

  clearEndTimer(session.pin);
  await deleteSession(session.pin, quizId);
}
