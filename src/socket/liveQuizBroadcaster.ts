import { Server as SocketIOServer, Socket } from 'socket.io';
import { Quiz } from '../models/Quiz.js';
import { Membership } from '../models/Membership.js';
import { getSessions, getSessionByQuizId, getSessionByPin } from './liveQuizStore.js';
import { sanitizeQuestion, buildLeaderboard, gradeAnswer, endQuizSession } from './liveQuizGrading.js';

export function registerLiveQuizHandlers(io: SocketIOServer, socket: Socket): void {
  const user = (socket as any).user;
  if (!user) return;

  const sessions = getSessions();

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

    session.teacherSocketId = socket.id;
    socket.join(`live:${data.pin}`);
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[2m${user.name}\x1b[0m teacher_ready session \x1b[1m${data.pin}\x1b[0m`);

    socket.emit('session_info', {
      pin: session.pin,
      quizTitle: '',
      questionCount: session.questions.length,
      participants: session.participants.map((p) => ({ userId: p.userId, displayName: p.displayName })),
      status: session.status,
    });

    Quiz.findById(session.quizId).then((quiz) => {
      if (quiz) {
        socket.emit('session_info', {
          pin: session.pin,
          quizTitle: quiz.title,
          questionCount: session.questions.length,
          participants: session.participants.map((p) => ({ userId: p.userId, displayName: p.displayName })),
          status: session.status,
        });
      }
    });
  });

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

    const membership = await Membership.findOne({ userId: user._id, classId: session.classId, status: 'approved' });
    if (!membership) {
      socket.emit('join_error', { message: 'Anda tidak terdaftar di kelas ini.' });
      return;
    }

    const existingIdx = session.participants.findIndex((p) => p.userId === user._id.toString());
    const isReconnect = existingIdx >= 0;

    if (isReconnect) {
      session.participants[existingIdx].socketId = socket.id;
      session.participants[existingIdx].connected = true;
    } else {
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

    socket.join(`live:${data.pin}`);
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[2m${data.displayName || user.name}\x1b[0m ${isReconnect ? 'reconnected to' : 'joined'} session \x1b[1m${data.pin}\x1b[0m  \x1b[2m(${session.participants.length} total)\x1b[0m`);

    const quiz = await Quiz.findById(session.quizId);
    socket.emit('join_success', {
      pin: data.pin,
      quizId: session.quizId,
      quizTitle: quiz?.title || 'Live Quiz',
      participantCount: session.participants.length,
    });

    if (isReconnect && session.status === 'active') {
      const sanitizedQuestions = session.questions.map((q, i) => sanitizeQuestion(q, i));
      const reconnectQuiz = await Quiz.findById(session.quizId);
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

    io.to(`live:${data.pin}`).emit('participant_joined', {
      displayName: data.displayName || user.name,
      participantCount: session.participants.length,
      participants: session.participants.map((p) => ({ userId: p.userId, displayName: p.displayName })),
    });
  });

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

    await Quiz.findByIdAndUpdate(session.quizId, { status: 'in_progress' });

    const sanitizedQuestions = session.questions.map((q, i) => sanitizeQuestion(q, i));

    io.to(`live:${data.pin}`).emit('quiz_started', {
      quizId: session.quizId,
      allQuestions: sanitizedQuestions,
      totalDurationSec: session.totalDurationSec,
      totalQuestions: session.questions.length,
      allowBacktrack: false,
      shuffleQuestions: quiz?.shuffleQuestions ?? false,
      shuffleOptions: quiz?.shuffleOptions ?? false,
    });

    console.log(`\x1b[35m🎮 Live\x1b[0m   Timer set \x1b[2m${session.totalDurationSec}s\x1b[0m for session \x1b[1m${data.pin}\x1b[0m`);
    session.endTimer = setTimeout(() => {
      console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[33m⏰ Timer expired\x1b[0m session \x1b[1m${data.pin}\x1b[0m`);
      endQuizSession(session, data.pin, io);
    }, session.totalDurationSec * 1000);
  });

  socket.on('submit_answer', (data: { pin: string; questionIndex: number; answer: string; timeMs: number }) => {
    const session = sessions.get(data.pin);
    if (!session || session.status !== 'active') {
      socket.emit('join_error', { message: 'No active session' });
      return;
    }

    const userId = user._id.toString();
    if (data.questionIndex < 0 || data.questionIndex >= session.questions.length) return;

    if (!session.answers[userId]) session.answers[userId] = {};
    if (session.answers[userId][data.questionIndex]) {
      socket.emit('answer_received', { questionIndex: data.questionIndex });
      return;
    }

    const result = gradeAnswer(session.questions[data.questionIndex], data.answer);
    session.answers[userId][data.questionIndex] = {
      answer: data.answer,
      timeMs: data.timeMs || 0,
      correct: result.correct,
      points: result.points,
    };

    socket.emit('answer_received', { questionIndex: data.questionIndex });

    const answerCount = Object.keys(session.answers).filter(
      (uid) => session.answers[uid][data.questionIndex] !== undefined
    ).length;

    if (session.teacherSocketId) {
      io.to(session.teacherSocketId).emit('answer_count_update', {
        questionIndex: data.questionIndex,
        count: answerCount,
        total: session.participants.length,
      });
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

  socket.on('submit_all_answers', (data: { pin: string; answers: { questionIndex: number; answer: string; timeMs: number }[] }) => {
    const session = sessions.get(data.pin);
    if (!session || session.status !== 'active') {
      socket.emit('join_error', { message: 'No active session' });
      return;
    }

    const userId = user._id.toString();
    if (!session.answers[userId]) session.answers[userId] = {};

    for (const ans of data.answers) {
      if (ans.questionIndex < 0 || ans.questionIndex >= session.questions.length) continue;
      if (session.answers[userId][ans.questionIndex]) continue;

      const result = gradeAnswer(session.questions[ans.questionIndex], ans.answer);
      session.answers[userId][ans.questionIndex] = {
        answer: ans.answer,
        timeMs: ans.timeMs || 0,
        correct: result.correct,
        points: result.points,
      };
    }

    session.finishCount++;
    const connectedCount = session.participants.filter((p) => p.connected).length;
    const finisherName = session.participants.find((p) => p.userId === userId)?.displayName || userId;
    console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[2m${finisherName}\x1b[0m finished session \x1b[1m${data.pin}\x1b[0m  \x1b[2m(${session.finishCount}/${connectedCount} done)\x1b[0m`);

    socket.emit('answer_received', { finished: true });

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
        total: connectedCount,
        displayName: session.participants.find((p) => p.userId === userId)?.displayName || '',
      });
    }

    if (session.finishCount >= connectedCount && connectedCount > 0) {
      console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[32mAll ${connectedCount} students finished\x1b[0m session \x1b[1m${data.pin}\x1b[0m`);
      if (session.endTimer) { clearTimeout(session.endTimer); session.endTimer = null; }
      endQuizSession(session, data.pin, io);
    }
  });

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

  socket.on('disconnect', () => {
    for (const [pin, session] of sessions) {
      if (session.teacherSocketId === socket.id) {
        session.teacherSocketId = null;
        console.log(`\x1b[35m🎮 Live\x1b[0m   \x1b[33mTeacher disconnected\x1b[0m from session \x1b[1m${pin}\x1b[0m`);
        io.to(`live:${pin}`).emit('teacher_disconnected', {});
        continue;
      }

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

        if (session.status === 'active' && activeCount > 0 && session.finishCount >= activeCount) {
          if (session.endTimer) { clearTimeout(session.endTimer); session.endTimer = null; }
          endQuizSession(session, pin, io);
        }
      }
    }
  });
}
