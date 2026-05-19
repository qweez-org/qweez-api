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
      const correctOptions = question.options.filter((o) => o.isCorrect);
      const isCorrect = correctOptions.some((o) => o.text === answer.answer);
      if (isCorrect) {
        answer.isCorrect = true;
        answer.points = question.points;
        score += question.points;
      } else {
        answer.isCorrect = false;
        answer.points = 0;
      }
      await answer.save();
    } else if (question.type === 'short_answer') {
      let isCorrect = false;
      let studentAnswer = answer.answer;
      
      if (!question.spaceSensitive) studentAnswer = studentAnswer.trim().replace(/\s+/g, ' ');
      if (!question.caseSensitive) studentAnswer = studentAnswer.toLowerCase();

      for (const opt of question.options) {
        if (!opt.isCorrect) continue;
        let correctText = opt.text;
        if (!question.spaceSensitive) correctText = correctText.trim().replace(/\s+/g, ' ');
        if (!question.caseSensitive) correctText = correctText.toLowerCase();

        if (studentAnswer === correctText) {
          isCorrect = true;
          break;
        }
      }

      answer.isCorrect = isCorrect;
      answer.points = isCorrect ? question.points : 0;
      if (isCorrect) score += question.points;
      await answer.save();
    }
  }

  attempt.score = score;
  attempt.totalPoints = totalPoints;
  await attempt.save();

  return { score, totalPoints };
};
