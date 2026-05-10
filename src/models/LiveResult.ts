import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveResultAnswer {
  questionId: mongoose.Types.ObjectId;
  answer: string;
  isCorrect: boolean;
  points: number;
}

export interface ILiveResult extends Document {
  _id: mongoose.Types.ObjectId;
  sessionPin: string;
  quizId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  score: number;
  totalPoints: number;
  answers: ILiveResultAnswer[];
  rank: number;
  createdAt: Date;
  updatedAt: Date;
}

const liveResultSchema = new Schema<ILiveResult>(
  {
    sessionPin: { type: String, required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, default: 0 },
    totalPoints: { type: Number, required: true, default: 0 },
    answers: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
        answer: { type: String, default: '' },
        isCorrect: { type: Boolean, default: false },
        points: { type: Number, default: 0 },
      },
    ],
    rank: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

liveResultSchema.index({ quizId: 1, userId: 1 });
liveResultSchema.index({ sessionPin: 1 });

export const LiveResult = mongoose.model<ILiveResult>('LiveResult', liveResultSchema);
