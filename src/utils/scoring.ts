import { Question, IQuestion } from '../models/Question.js';
import { Answer } from '../models/Answer.js';
import { Attempt } from '../models/Attempt.js';

export const scoreAttempt = async (attemptId: string): Promise<{ score: number; totalPoints: number }> => {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt) throw new Error('Attempt not found');

  const answers = await Answer.find({ attemptId });
  const questions = await Question.find({ quizId: attempt.quizId });

  let score = 0;
  let totalPoints = 0;

  for (const question of questions) {
    totalPoints += question.points;

    const answer = answers.find((a) => a.questionId.toString() === question._id.toString());
    if (!answer) continue;

    if (question.type === 'multiple_choice') {
      const correctOption = question.options.find((o) => o.isCorrect);
      if (correctOption && answer.answer === correctOption.text) {
        answer.isCorrect = true;
        answer.points = question.points;
        score += question.points;
      } else {
        answer.isCorrect = false;
        answer.points = 0;
      }
      await answer.save();
    }
    // Essay questions are graded manually by teachers
  }

  attempt.score = score;
  attempt.totalPoints = totalPoints;
  await attempt.save();

  return { score, totalPoints };
};
