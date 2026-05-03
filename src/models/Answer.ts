import mongoose, { Schema, Document } from 'mongoose';

export interface IAnswer extends Document {
  _id: mongoose.Types.ObjectId;
  attemptId: mongoose.Types.ObjectId;
  questionId: mongoose.Types.ObjectId;
  answer: string;
  isCorrect?: boolean;
  points?: number;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<IAnswer>(
  {
    attemptId: { type: Schema.Types.ObjectId, ref: 'Attempt', required: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    answer: { type: String, required: true },
    isCorrect: { type: Boolean },
    points: { type: Number },
  },
  { timestamps: true }
);

answerSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

export const Answer = mongoose.model<IAnswer>('Answer', answerSchema);
