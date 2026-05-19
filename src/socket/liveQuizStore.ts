import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { IQuestion } from '../models/Question.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';

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
  createdAt: Date;
  finishCount: number;
  totalDurationSec: number;
  endTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, LiveSession>();
const quizIdToPin = new Map<string, string>();

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [pin, session] of sessions.entries()) {
    const createdAt = session.createdAt instanceof Date ? session.createdAt.getTime() : new Date(session.createdAt).getTime();
    if (createdAt + SESSION_TTL_MS <= now) {
      sessions.delete(pin);
      quizIdToPin.delete(session.quizId);
    }
  }
}

setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS).unref();

function generatePin(): string {
  let pin: string;
  do {
    pin = crypto.randomInt(100000, 999999).toString();
  } while (sessions.has(pin));
  return pin;
}

export function getSessions(): Map<string, LiveSession> {
  return sessions;
}

export function getQuizIdToPin(): Map<string, string> {
  return quizIdToPin;
}

export function getSessionByQuizId(quizId: string): LiveSession | undefined {
  const pin = quizIdToPin.get(quizId);
  if (!pin) return undefined;
  return sessions.get(pin);
}

export function getSessionByPin(pin: string): LiveSession | undefined {
  return sessions.get(pin);
}

export async function createLiveSession(
  quizId: string,
  teacherUserId: string
): Promise<{ pin: string; sessionId: string; questionCount: number }> {
  const existingPin = quizIdToPin.get(quizId);
  if (existingPin) {
    const existing = sessions.get(existingPin);
    if (existing && existing.status !== 'finished') {
      return { pin: existingPin, sessionId: existing.sessionId, questionCount: existing.questions.length };
    }
    sessions.delete(existingPin);
    quizIdToPin.delete(quizId);
  }

  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw new Error('Quiz not found');

  const topic = await Topic.findById(quiz.topicId);
  if (!topic) throw new Error('Topic not found');

  const { Question } = await import('../models/Question.js');
  const questions = await Question.find({ quizId }).sort({ order: 1 });
  if (questions.length === 0) throw new Error('Quiz has no questions');

  const pin = generatePin();
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
    createdAt: new Date(),
    finishCount: 0,
    totalDurationSec: 0,
    endTimer: null,
  };

  sessions.set(pin, session);
  quizIdToPin.set(quizId, pin);

  quiz.status = 'waiting';
  quiz.mode = 'live';
  await quiz.save();

  return { pin, sessionId, questionCount: questions.length };
}

export function cancelLiveSession(quizId: string, io?: SocketIOServer): void {
  const pin = quizIdToPin.get(quizId);
  if (!pin) return;
  const session = sessions.get(pin);
  if (!session) return;
  console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[33mSession cancelled\x1b[0m \x1b[1m${pin}\x1b[0m`);
  io?.to(`live:${pin}`).emit('session_cancelled', { reason: 'Teacher cancelled the session' });
  sessions.delete(pin);
  quizIdToPin.delete(quizId);
}
