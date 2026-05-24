import mongoose, { Schema, Document } from 'mongoose';

export interface IAttempt extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  quizId: mongoose.Types.ObjectId;
  status: 'in_progress' | 'submitted';
  startedAt: Date;
  submittedAt?: Date;
  score?: number;
  totalPoints?: number;
  createdAt: Date;
  updatedAt: Date;
}

const attemptSchema = new Schema<IAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    status: { type: String, required: true, enum: ['in_progress', 'submitted'], default: 'in_progress' },
    startedAt: { type: Date, required: true, default: Date.now },
    submittedAt: { type: Date },
    score: { type: Number },
    totalPoints: { type: Number },
  },
  { timestamps: true }
);

attemptSchema.index({ userId: 1, quizId: 1 });
attemptSchema.index({ quizId: 1 });
attemptSchema.index({ quizId: 1, status: 1 });

export const Attempt = mongoose.model<IAttempt>('Attempt', attemptSchema);
