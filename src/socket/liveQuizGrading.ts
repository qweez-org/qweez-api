import { Server as SocketIOServer } from 'socket.io';
import { Attempt } from '../models/Attempt.js';
import { Answer } from '../models/Answer.js';
import { Quiz } from '../models/Quiz.js';
import { IQuestion } from '../models/Question.js';
import { LiveSession, saveSession, deleteSession, clearEndTimer } from './liveQuizStore.js';

export function sanitizeQuestion(q: IQuestion, index: number) {
  return {
    _id: q._id,
    text: q.text,
    type: q.type,
    points: q.points,
    order: q.order ?? index,
    options: q.type === 'short_answer' ? [] : (q.options?.map((opt) => ({ text: opt.text })) || []),
  };
}

export function buildLeaderboard(session: LiveSession) {
  const scores: { userId: string; displayName: string; totalScore: number; totalTime: number }[] = [];

  for (const p of session.participants) {
    const userAnswers = session.answers[p.userId] || {};
    let totalScore = 0;
    let totalTime = 0;
    for (const ans of Object.values(userAnswers)) {
      totalScore += ans.points;
      totalTime += ans.timeMs;
    }
    scores.push({ userId: p.userId, displayName: p.displayName, totalScore, totalTime });
  }

  scores.sort((a, b) => b.totalScore - a.totalScore || a.totalTime - b.totalTime);

  return scores.map((s, i) => ({
    rank: i + 1,
    userId: s.userId,
    displayName: s.displayName,
    score: s.totalScore,
    totalTime: s.totalTime,
  }));
}

export function gradeAnswer(question: IQuestion, answerText: string): { correct: boolean; points: number } {
  let correct = false;
  let points = 0;

  if (question.type === 'multiple_choice') {
    const correctOptions = (question.options || []).filter((o) => o.isCorrect);
    correct = correctOptions.some((o) => o.text === answerText);
    if (correct) points = question.points;
  } else if (question.type === 'short_answer') {
    let studentAnswer = answerText;
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

  return { correct, points };
}

export async function endQuizSession(session: LiveSession, pin: string, io: SocketIOServer) {
  if (session.status === 'finished') return;
  session.status = 'finished';
  console.log(`\x1b[35m🎮 Live\x1b[0m   Session \x1b[1m${pin}\x1b[0m ended  \x1b[2m(${session.participants.length} participants)\x1b[0m`);
  Quiz.findByIdAndUpdate(session.quizId, { status: 'finished' }).catch((e) => console.error('Failed to update quiz status to finished:', e));

  const leaderboard = buildLeaderboard(session);

  try {
    const totalPoints = session.questions.reduce((sum, q) => sum + q.points, 0);
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

  if (leaderboard.length > 0) {
    const top = leaderboard.slice(0, 3).map((e) => `${e.displayName}:${e.score}pts`).join(', ');
    console.log(`\x1b[35m🎮 Live\x1b[0m   Leaderboard \x1b[1m${pin}\x1b[0m  \x1b[2mTop: ${top}\x1b[0m`);
  }

  io.to(`live:${pin}`).emit('quiz_ended', { leaderboard });

  clearEndTimer(pin);

  // Mark session as finished in Redis, then schedule cleanup
  await saveSession(pin, session);
  setTimeout(async () => {
    await deleteSession(pin, session.quizId);
  }, 5 * 60 * 1000);
}
