import { Server as SocketIOServer, Socket } from 'socket.io';
import { Question, IQuestion } from '../models/Question.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';
import { Membership } from '../models/Membership.js';
import { LiveResult } from '../models/LiveResult.js';
import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
}

interface StudentAnswer {
  answer: string;
  timeMs: number;
  correct: boolean;
  points: number;
}

interface LiveSession {
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
  // answers[userId][questionIndex] = StudentAnswer
  answers: Record<string, Record<number, StudentAnswer>>;
  createdAt: Date;
}

// ─── Session Store ───────────────────────────────────────────────────────────

// Keyed by PIN for student lookup, also indexed by quizId for REST endpoints
const sessions = new Map<string, LiveSession>();
const quizIdToPin = new Map<string, string>();

function generatePin(): string {
  // 6-digit numeric PIN, avoid collisions
  let pin: string;
  do {
    pin = crypto.randomInt(100000, 999999).toString();
  } while (sessions.has(pin));
  return pin;
}

function sanitizeQuestion(q: IQuestion, index: number) {
  // Strip isCorrect from options before sending to students
  return {
    _id: q._id,
    text: q.text,
    type: q.type,
    points: q.points,
    questionIndex: index,
    options: q.options?.map((opt) => ({ text: opt.text })) || [],
  };
}

function buildLeaderboard(session: LiveSession) {
  const scores: { userId: string; displayName: string; totalScore: number; totalTime: number }[] = [];

  for (const p of session.participants) {
    const userAnswers = session.answers[p.userId] || {};
    let totalScore = 0;
    let totalTime = 0;
    for (const ans of Object.values(userAnswers)) {
      totalScore += ans.points;
      totalTime += ans.timeMs;
    }
    scores.push({
      userId: p.userId,
      displayName: p.displayName,
      totalScore,
      totalTime,
    });
  }

  // Sort by score desc, then time asc
  scores.sort((a, b) => b.totalScore - a.totalScore || a.totalTime - b.totalTime);

  return scores.map((s, i) => ({
    rank: i + 1,
    userId: s.userId,
    displayName: s.displayName,
    score: s.totalScore,
    totalTime: s.totalTime,
  }));
}

// ─── Public API (called from REST routes) ────────────────────────────────────

export async function createLiveSession(
  quizId: string,
  teacherUserId: string
): Promise<{ pin: string; sessionId: string; questionCount: number }> {
  // Check if quiz already has an active session
  const existingPin = quizIdToPin.get(quizId);
  if (existingPin) {
    const existing = sessions.get(existingPin);
    if (existing && existing.status !== 'finished') {
      // Return existing session
      return { pin: existingPin, sessionId: existing.sessionId, questionCount: existing.questions.length };
    }
    // Clean up finished session
    sessions.delete(existingPin);
    quizIdToPin.delete(quizId);
  }

  // Load quiz and questions
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw new Error('Quiz not found');

  const topic = await Topic.findById(quiz.topicId);
  if (!topic) throw new Error('Topic not found');

  const questions = await Question.find({ quizId }).sort({ order: 1 });
  if (questions.length === 0) throw new Error('Quiz has no questions');

  const pin = generatePin();
  const sessionId = crypto.randomUUID();

  const session: LiveSession = {
    sessionId,
    pin,
    quizId,
    classId: topic.classId.toString(),
    teacherSocketId: null, // Set when teacher connects via socket
    teacherUserId,
    status: 'waiting',
    participants: [],
    questions,
    currentQuestionIndex: -1, // Not started yet
    answers: {},
    createdAt: new Date(),
  };

  sessions.set(pin, session);
  quizIdToPin.set(quizId, pin);

  // Update quiz status in DB
  quiz.status = 'waiting';
  quiz.mode = 'live';
  await quiz.save();

  return { pin, sessionId, questionCount: questions.length };
}

export function cancelLiveSession(quizId: string, io: SocketIOServer): void {
  const pin = quizIdToPin.get(quizId);
  if (!pin) return;
  const session = sessions.get(pin);
  if (!session) return;

  io.to(`live:${pin}`).emit('session_cancelled', { reason: 'Teacher cancelled the session' });

  sessions.delete(pin);
  quizIdToPin.delete(quizId);
}

export function getSessionByQuizId(quizId: string): LiveSession | undefined {
  const pin = quizIdToPin.get(quizId);
  if (!pin) return undefined;
  return sessions.get(pin);
}

export function getSessionByPin(pin: string): LiveSession | undefined {
  return sessions.get(pin);
}

// ─── Socket Event Handlers ───────────────────────────────────────────────────

export function registerLiveQuizHandlers(io: SocketIOServer, socket: Socket): void {
  const user = (socket as any).user;
  if (!user) return;

  // ── teacher_ready ──────────────────────────────────────────────────────────
  socket.on('teacher_ready', (data: { pin: string }) => {
    const session = sessions.get(data.pin);
    if (!session) {
      socket.emit('join_error', { message: 'Session not found' });
      return;
    }

    if (session.teacherUserId !== user._id.toString()) {
      socket.emit('join_error', { message: 'You are not the owner of this session' });
      return;
    }

    // Register teacher socket and join room
    session.teacherSocketId = socket.id;
    socket.join(`live:${data.pin}`);

    socket.emit('session_info', {
      pin: session.pin,
      quizTitle: session.questions.length > 0 ? '' : '', // We'll get it from the quiz
      questionCount: session.questions.length,
      participants: session.participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
      })),
      status: session.status,
    });

    // Fetch quiz title async and re-emit
    Quiz.findById(session.quizId).then((quiz) => {
      if (quiz) {
        socket.emit('session_info', {
          pin: session.pin,
          quizTitle: quiz.title,
          questionCount: session.questions.length,
          participants: session.participants.map((p) => ({
            userId: p.userId,
            displayName: p.displayName,
          })),
          status: session.status,
        });
      }
    });
  });

  // ── student_join ───────────────────────────────────────────────────────────
  socket.on('student_join', async (data: { pin: string; displayName: string }) => {
    const session = sessions.get(data.pin);
    if (!session) {
      socket.emit('join_error', { message: 'PIN tidak valid. Sesi tidak ditemukan.' });
      return;
    }

    if (session.status === 'finished') {
      socket.emit('join_error', { message: 'Sesi sudah selesai.' });
      return;
    }

    // Bug #4 fix: Verify class membership before allowing join
    const membership = await Membership.findOne({
      userId: user._id,
      classId: session.classId,
      status: 'approved',
    });
    if (!membership) {
      socket.emit('join_error', { message: 'Anda tidak terdaftar di kelas ini.' });
      return;
    }

    // Check if student already joined (allow reconnect)
    const existingIdx = session.participants.findIndex((p) => p.userId === user._id.toString());
    const isReconnect = existingIdx >= 0;

    if (isReconnect) {
      // Update socket ID for reconnect
      session.participants[existingIdx].socketId = socket.id;
    } else {
      // New join — only allowed during waiting
      if (session.status !== 'waiting') {
        socket.emit('join_error', { message: 'Sesi sudah dimulai. Tidak bisa bergabung.' });
        return;
      }
      session.participants.push({
        socketId: socket.id,
        userId: user._id.toString(),
        displayName: data.displayName || user.name,
      });
    }

    // Join the live room
    socket.join(`live:${data.pin}`);

    // Confirm to the joining student
    const quiz = await Quiz.findById(session.quizId);
    socket.emit('join_success', {
      pin: data.pin,
      quizTitle: quiz?.title || 'Live Quiz',
      participantCount: session.participants.length,
    });

    // Bug #16 fix: If session is already active, send current question to reconnecting student
    if (isReconnect && session.status === 'active' && session.currentQuestionIndex >= 0) {
      const currentQ = session.questions[session.currentQuestionIndex];
      socket.emit('quiz_started', {
        questionIndex: session.currentQuestionIndex,
        question: sanitizeQuestion(currentQ, session.currentQuestionIndex),
        timeLimit: quiz?.duration ? Math.floor((quiz.duration * 60) / session.questions.length) : 30,
        totalQuestions: session.questions.length,
      });
    }

    // Broadcast to entire room (teacher + other students)
    io.to(`live:${data.pin}`).emit('participant_joined', {
      displayName: data.displayName || user.name,
      participantCount: session.participants.length,
      participants: session.participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
      })),
    });
  });

  // ── start_quiz ─────────────────────────────────────────────────────────────
  socket.on('start_quiz', async (data: { pin: string }) => {
    const session = sessions.get(data.pin);
    if (!session) {
      socket.emit('join_error', { message: 'Session not found' });
      return;
    }

    if (session.teacherUserId !== user._id.toString()) {
      socket.emit('join_error', { message: 'Only the teacher can start the quiz' });
      return;
    }

    if (session.status !== 'waiting') {
      socket.emit('join_error', { message: 'Session is not in waiting state' });
      return;
    }

    if (session.questions.length === 0) {
      socket.emit('join_error', { message: 'Quiz has no questions' });
      return;
    }

    session.status = 'active';
    session.currentQuestionIndex = 0;

    // Update quiz status in DB
    await Quiz.findByIdAndUpdate(session.quizId, { status: 'in_progress' });

    const q = session.questions[0];
    const quiz = await Quiz.findById(session.quizId);

    // Broadcast first question to everyone
    io.to(`live:${data.pin}`).emit('quiz_started', {
      questionIndex: 0,
      question: sanitizeQuestion(q, 0),
      timeLimit: quiz?.duration ? Math.floor((quiz.duration * 60) / session.questions.length) : 30,
      totalQuestions: session.questions.length,
    });
  });

  // ── submit_answer ──────────────────────────────────────────────────────────
  socket.on('submit_answer', (data: { pin: string; questionIndex: number; answer: string; timeMs: number }) => {
    const session = sessions.get(data.pin);
    if (!session || session.status !== 'active') {
      socket.emit('join_error', { message: 'No active session' });
      return;
    }

    const userId = user._id.toString();

    // Validate question index
    if (data.questionIndex < 0 || data.questionIndex >= session.questions.length) {
      return;
    }

    // Initialize answers for this user if needed
    if (!session.answers[userId]) {
      session.answers[userId] = {};
    }

    // Don't allow re-answering
    if (session.answers[userId][data.questionIndex]) {
      socket.emit('answer_received', { questionIndex: data.questionIndex });
      return;
    }

    // Grade the answer
    const question = session.questions[data.questionIndex];
    let correct = false;
    let points = 0;

    if (question.type === 'multiple_choice') {
      const correctOption = question.options?.find((o) => o.isCorrect);
      correct = correctOption?.text === data.answer;
      if (correct) points = question.points;
    }
    // Essay questions are not auto-graded in live mode

    session.answers[userId][data.questionIndex] = {
      answer: data.answer,
      timeMs: data.timeMs || 0,
      correct,
      points,
    };

    // Acknowledge to student
    socket.emit('answer_received', { questionIndex: data.questionIndex });

    // Notify teacher of answer count
    const answerCount = Object.keys(session.answers).filter(
      (uid) => session.answers[uid][data.questionIndex] !== undefined
    ).length;

    if (session.teacherSocketId) {
      io.to(session.teacherSocketId).emit('answer_count_update', {
        questionIndex: data.questionIndex,
        count: answerCount,
        total: session.participants.length,
      });
    }
  });

  // ── next_question ──────────────────────────────────────────────────────────
  socket.on('next_question', async (data: { pin: string }) => {
    const session = sessions.get(data.pin);
    if (!session || session.status !== 'active') return;

    if (session.teacherUserId !== user._id.toString()) return;

    // First, broadcast result of current question
    const currentQ = session.questions[session.currentQuestionIndex];
    if (currentQ) {
      const correctOption = currentQ.options?.find((o) => o.isCorrect);

      // Count correct/wrong for stats
      let correctCount = 0;
      let totalAnswered = 0;
      for (const userId of Object.keys(session.answers)) {
        const ans = session.answers[userId][session.currentQuestionIndex];
        if (ans) {
          totalAnswered++;
          if (ans.correct) correctCount++;
        }
      }

      io.to(`live:${data.pin}`).emit('question_result', {
        questionIndex: session.currentQuestionIndex,
        correctAnswer: correctOption?.text || '',
        stats: {
          totalAnswered,
          correctCount,
          wrongCount: totalAnswered - correctCount,
        },
      });
    }

    // Move to next question
    session.currentQuestionIndex++;

    if (session.currentQuestionIndex >= session.questions.length) {
      // Quiz is done
      session.status = 'finished';
      await Quiz.findByIdAndUpdate(session.quizId, { status: 'finished' });

      const leaderboard = buildLeaderboard(session);

      // Bug #12 fix: Persist all live quiz results to DB
      try {
        const totalPoints = session.questions.reduce((sum, q) => sum + q.points, 0);
        for (const entry of leaderboard) {
          const userAnswers = session.answers[entry.userId] || {};
          const answerDocs = session.questions.map((q, idx) => {
            const ans = userAnswers[idx];
            return {
              questionId: q._id,
              answer: ans?.answer || '',
              isCorrect: ans?.correct || false,
              points: ans?.points || 0,
            };
          });

          await LiveResult.findOneAndUpdate(
            { sessionPin: data.pin, quizId: session.quizId, userId: entry.userId },
            {
              score: entry.score,
              totalPoints,
              answers: answerDocs,
              rank: entry.rank,
            },
            { upsert: true, new: true }
          );
        }
        console.log(`🏆 Live results persisted for ${leaderboard.length} participants`);
      } catch (err) {
        console.error('Failed to persist live results:', err);
      }

      io.to(`live:${data.pin}`).emit('quiz_ended', { leaderboard });

      // Clean up after a delay
      setTimeout(() => {
        sessions.delete(data.pin);
        quizIdToPin.delete(session.quizId);
      }, 5 * 60 * 1000); // Keep for 5 minutes for late viewers

      return;
    }

    // Broadcast next question
    const nextQ = session.questions[session.currentQuestionIndex];
    const quiz = await Quiz.findById(session.quizId);

    io.to(`live:${data.pin}`).emit('question_start', {
      questionIndex: session.currentQuestionIndex,
      question: sanitizeQuestion(nextQ, session.currentQuestionIndex),
      timeLimit: quiz?.duration ? Math.floor((quiz.duration * 60) / session.questions.length) : 30,
      totalQuestions: session.questions.length,
    });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Check all sessions for this socket
    for (const [pin, session] of sessions) {
      // Teacher disconnect
      if (session.teacherSocketId === socket.id) {
        session.teacherSocketId = null;
        io.to(`live:${pin}`).emit('teacher_disconnected', {});
        continue;
      }

      // Student disconnect
      const idx = session.participants.findIndex((p) => p.socketId === socket.id);
      if (idx >= 0) {
        const removed = session.participants[idx];
        // Don't remove from participants (they might reconnect), just notify
        io.to(`live:${pin}`).emit('participant_left', {
          displayName: removed.displayName,
          participantCount: session.participants.length,
        });
      }
    }
  });
}
