import { Server as SocketIOServer, Socket } from 'socket.io';
import { Question, IQuestion } from '../models/Question.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';
import { Membership } from '../models/Membership.js';
import { Answer } from '../models/Answer.js';
import { Attempt } from '../models/Attempt.js';
import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  connected: boolean;
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
  finishCount: number;          // how many students have submitted all answers
  totalDurationSec: number;     // quiz duration in seconds (set when quiz starts)
  endTimer: NodeJS.Timeout | null; // auto-end timer reference
}

async function endQuizSession(session: LiveSession, pin: string, io: SocketIOServer) {
  if (session.status === 'finished') return;
  session.status = 'finished';
  console.log(`\x1b[35m🎮 Live\x1b[0m   Session \x1b[1m${pin}\x1b[0m ended  \x1b[2m(${session.participants.length} participants)\x1b[0m`);
  Quiz.findByIdAndUpdate(session.quizId, { status: 'finished' }).catch((e) => console.error('Failed to update quiz status to finished:', e));

  const leaderboard = buildLeaderboard(session);

  // Persist results
  try {
    const totalPoints = session.questions.reduce((sum, q) => sum + q.points, 0);
    // Create Attempt and Answer records so live results appear in normal quiz history
    for (const entry of leaderboard) {
      try {
        const attempt = await Attempt.create({
          userId: entry.userId,
          quizId: session.quizId,
          status: 'submitted',
          score: entry.score,
          totalPoints,
          submittedAt: new Date(),
        });

        const userAnswers = session.answers[entry.userId] || {};
        const answerDocs = session.questions.map((q, idx) => {
          const ans = userAnswers[idx];
          return {
            attemptId: attempt._id,
            questionId: q._id,
            answer: ans?.answer || '',
            isCorrect: ans?.correct || false,
            points: ans?.points || 0,
          };
        });

        await Answer.insertMany(answerDocs);
      } catch (err) {
        console.error(`Failed to persist live result for user ${entry.userId}:`, err);
      }
    }

  } catch (err) {
    console.error('Failed to persist live results:', err);
  }

  // Log leaderboard summary
  if (leaderboard.length > 0) {
    const top = leaderboard.slice(0, 3).map((e) => `${e.displayName}:${e.score}pts`).join(', ');
    console.log(`\x1b[35m🎮 Live\x1b[0m   Leaderboard \x1b[1m${pin}\x1b[0m  \x1b[2mTop: ${top}\x1b[0m`);
  }

  io.to(`live:${pin}`).emit('quiz_ended', { leaderboard });

  // Clean up timer if any
  if (session.endTimer) {
    clearTimeout(session.endTimer);
    session.endTimer = null;
  }

  // Keep session for 5 minutes for late viewers
  setTimeout(() => {
    sessions.delete(pin);
    quizIdToPin.delete(session.quizId);
  }, 5 * 60 * 1000);
}

// ─── Session Store ───────────────────────────────────────────────────────────

// Keyed by PIN for student lookup, also indexed by quizId for REST endpoints
const sessions = new Map<string, LiveSession>();
const quizIdToPin = new Map<string, string>();

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [pin, session] of sessions.entries()) {
    const createdAt = session.createdAt instanceof Date ? session.createdAt.getTime() : new Date(session.createdAt).getTime();
    const expired = createdAt + SESSION_TTL_MS <= now;
    if (expired) {
      sessions.delete(pin);
      quizIdToPin.delete(session.quizId);
    }
  }
}

setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS).unref();

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
  // For short_answer, don't send options at all (they contain correct answers)
  // Use order from DB (fallback to index) to match normal quiz question format
  return {
    _id: q._id,
    text: q.text,
    type: q.type,
    points: q.points,
    order: q.order ?? index,
    options: q.type === 'short_answer' ? [] : (q.options?.map((opt) => ({ text: opt.text })) || []),
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

  // Update quiz status in DB
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
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[2m${user.name}\x1b[0m teacher_ready session \x1b[1m${data.pin}\x1b[0m`);

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
      // Update socket ID for reconnect and mark as connected
      session.participants[existingIdx].socketId = socket.id;
      session.participants[existingIdx].connected = true;
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
        connected: true,
      });
    }

    // Join the live room
    socket.join(`live:${data.pin}`);
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[2m${data.displayName || user.name}\x1b[0m ${isReconnect ? 'reconnected to' : 'joined'} session \x1b[1m${data.pin}\x1b[0m  \x1b[2m(${session.participants.length} total)\x1b[0m`);

    // Confirm to the joining student
    const quiz = await Quiz.findById(session.quizId);
    socket.emit('join_success', {
      pin: data.pin,
      quizId: session.quizId,
      quizTitle: quiz?.title || 'Live Quiz',
      participantCount: session.participants.length,
    });

    // Bug #16 fix: If session is already active, send current question to reconnecting student
    if (isReconnect && session.status === 'active') {
      // Send full quiz data for reconnecting students (all-questions-at-once mode)
      const sanitizedQuestions = session.questions.map((q, i) => sanitizeQuestion(q, i));
      const reconnectQuiz = await Quiz.findById(session.quizId);
      
      // Extract existing answers to restore client state
      const existingAnswers: Record<number, any> = {};
      const userAns = session.answers[user._id.toString()];
      if (userAns) {
        for (const [qIdx, ansData] of Object.entries(userAns)) {
          existingAnswers[parseInt(qIdx, 10)] = ansData;
        }
      }
      
      socket.emit('quiz_started', {
        quizId: session.quizId,
        allQuestions: sanitizedQuestions,
        totalDurationSec: session.totalDurationSec,
        totalQuestions: session.questions.length,
        allowBacktrack: false,
        existingAnswers,
        shuffleQuestions: reconnectQuiz?.shuffleQuestions ?? false,
        shuffleOptions: reconnectQuiz?.shuffleOptions ?? false,
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
    session.finishCount = 0;
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[1mQuiz started\x1b[0m session \x1b[1m${data.pin}\x1b[0m  \x1b[2m(${session.participants.length} participants, ${session.questions.length} questions)\x1b[0m`);

    const quiz = await Quiz.findById(session.quizId);
    const durationMin = quiz?.duration || 10;
    session.totalDurationSec = durationMin * 60;

    // Update quiz status in DB
    await Quiz.findByIdAndUpdate(session.quizId, { status: 'in_progress' });

    const sanitizedQuestions = session.questions.map((q, i) => sanitizeQuestion(q, i));

    // Broadcast full quiz to everyone (all-questions-at-once mode)
    io.to(`live:${data.pin}`).emit('quiz_started', {
      quizId: session.quizId,
      allQuestions: sanitizedQuestions,
      totalDurationSec: session.totalDurationSec,
      totalQuestions: session.questions.length,
      allowBacktrack: false,
      shuffleQuestions: quiz?.shuffleQuestions ?? false,
      shuffleOptions: quiz?.shuffleOptions ?? false,
    });

    // Start auto-end timer
    console.log(`\x1b[35m🎮 Live\x1b[0m   Timer set \x1b[2m${session.totalDurationSec}s\x1b[0m for session \x1b[1m${data.pin}\x1b[0m`);
    session.endTimer = setTimeout(() => {
      console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[33m⏰ Timer expired\x1b[0m session \x1b[1m${data.pin}\x1b[0m`);
      endQuizSession(session, data.pin, io);
    }, session.totalDurationSec * 1000);
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
    } else if (question.type === 'short_answer') {
      let studentAnswer = data.answer;
      if (!question.spaceSensitive) studentAnswer = studentAnswer.trim().replace(/\s+/g, ' ');
      if (!question.caseSensitive) studentAnswer = studentAnswer.toLowerCase();

      for (const opt of question.options || []) {
        if (!opt.isCorrect) continue;
        let correctText = opt.text;
        if (!question.spaceSensitive) correctText = correctText.trim().replace(/\s+/g, ' ');
        if (!question.caseSensitive) correctText = correctText.toLowerCase();

        if (studentAnswer === correctText) {
          correct = true;
          break;
        }
      }
      if (correct) points = question.points;
    }

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

      // Rebuild and emit live leaderboard so teacher sees who rises per question
      const liveLeaderboard = buildLeaderboard(session);
      const answeredCounts: Record<string, number> = {};
      for (const p of session.participants) {
        answeredCounts[p.userId] = Object.keys(session.answers[p.userId] || {}).length;
      }
      io.to(session.teacherSocketId).emit('leaderboard_update', {
        leaderboard: liveLeaderboard,
        answeredCounts,
        totalQuestions: session.questions.length,
      });
    }
  });

  // ── submit_all_answers ─────────────────────────────────────────────────────
  socket.on('submit_all_answers', (data: { pin: string; answers: { questionIndex: number; answer: string; timeMs: number }[] }) => {
    const session = sessions.get(data.pin);
    if (!session || session.status !== 'active') {
      socket.emit('join_error', { message: 'No active session' });
      return;
    }

    const userId = user._id.toString();

    // Initialize answers for this user if needed
    if (!session.answers[userId]) {
      session.answers[userId] = {};
    }

    // Grade all submitted answers
    for (const ans of data.answers) {
      if (ans.questionIndex < 0 || ans.questionIndex >= session.questions.length) continue;
      // Don't overwrite existing answers
      if (session.answers[userId][ans.questionIndex]) continue;

      const question = session.questions[ans.questionIndex];
      let correct = false;
      let points = 0;

      if (question.type === 'multiple_choice') {
        const correctOption = question.options?.find((o) => o.isCorrect);
        correct = correctOption?.text === ans.answer;
        if (correct) points = question.points;
      } else if (question.type === 'short_answer') {
        let studentAnswer = ans.answer;
        if (!question.spaceSensitive) studentAnswer = studentAnswer.trim().replace(/\s+/g, ' ');
        if (!question.caseSensitive) studentAnswer = studentAnswer.toLowerCase();

        for (const opt of question.options || []) {
          if (!opt.isCorrect) continue;
          let correctText = opt.text;
          if (!question.spaceSensitive) correctText = correctText.trim().replace(/\s+/g, ' ');
          if (!question.caseSensitive) correctText = correctText.toLowerCase();

          if (studentAnswer === correctText) {
            correct = true;
            break;
          }
        }
        if (correct) points = question.points;
      }

      session.answers[userId][ans.questionIndex] = {
        answer: ans.answer,
        timeMs: ans.timeMs || 0,
        correct,
        points,
      };
    }

    session.finishCount++;
    const connectedCount = session.participants.filter((p) => p.connected).length;
    const finisherName = session.participants.find((p) => p.userId === userId)?.displayName || userId;
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[2m${finisherName}\x1b[0m finished session \x1b[1m${data.pin}\x1b[0m  \x1b[2m(${session.finishCount}/${connectedCount} done)\x1b[0m`);

    // Acknowledge to student
    socket.emit('answer_received', { finished: true });

    // Notify teacher of progress + latest live leaderboard
    const connectedParticipants = session.participants.filter((p) => p.connected).length;
    if (session.teacherSocketId) {
      const liveLeaderboard = buildLeaderboard(session);
      const answeredCounts: Record<string, number> = {};
      for (const p of session.participants) {
        answeredCounts[p.userId] = Object.keys(session.answers[p.userId] || {}).length;
      }
      io.to(session.teacherSocketId).emit('leaderboard_update', {
        leaderboard: liveLeaderboard,
        answeredCounts,
        totalQuestions: session.questions.length,
      });
      io.to(session.teacherSocketId).emit('student_finished', {
        finishCount: session.finishCount,
        total: connectedParticipants,
        displayName: session.participants.find((p) => p.userId === userId)?.displayName || '',
      });
    }

    // Auto-end if all connected students have finished
    if (session.finishCount >= connectedParticipants && connectedParticipants > 0) {
      console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[32mAll ${connectedParticipants} students finished\x1b[0m session \x1b[1m${data.pin}\x1b[0m`);
      if (session.endTimer) {
        clearTimeout(session.endTimer);
        session.endTimer = null;
      }
      endQuizSession(session, data.pin, io);
    }
  });

  // ── force_end ─────────────────────────────────────────────────────────────
  socket.on('force_end', async (data: { pin: string }) => {
    const session = sessions.get(data.pin);
    if (!session) {
      socket.emit('join_error', { message: 'Session not found' });
      return;
    }
    if (session.teacherUserId !== user._id.toString()) {
      socket.emit('join_error', { message: 'Only the teacher can end the quiz' });
      return;
    }
    if (session.status !== 'active') {
      socket.emit('join_error', { message: 'Session is not active' });
      return;
    }

    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[1mForce end\x1b[0m session \x1b[1m${data.pin}\x1b[0m by \x1b[2m${user.name}\x1b[0m`);
    await endQuizSession(session, data.pin, io);
  });



  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Check all sessions for this socket
    for (const [pin, session] of sessions) {
      // Teacher disconnect
      if (session.teacherSocketId === socket.id) {
        session.teacherSocketId = null;
        console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[33mTeacher disconnected\x1b[0m from session \x1b[1m${pin}\x1b[0m`);
        io.to(`live:${pin}`).emit('teacher_disconnected', {});
        continue;
      }

      // Student disconnect
      const idx = session.participants.findIndex((p) => p.socketId === socket.id);
      if (idx >= 0) {
        const participant = session.participants[idx];
        participant.connected = false;
        const activeCount = session.participants.filter((p) => p.connected).length;
        io.to(`live:${pin}`).emit('participant_left', {
          displayName: participant.displayName,
          participantCount: activeCount,
          totalParticipants: session.participants.length,
        });

        // Auto-end check: if all remaining connected students have finished
        if (session.status === 'active' && activeCount > 0 && session.finishCount >= activeCount) {

          if (session.endTimer) {
            clearTimeout(session.endTimer);
            session.endTimer = null;
          }
          endQuizSession(session, pin, io);
        }
      }
    }
  });
}
