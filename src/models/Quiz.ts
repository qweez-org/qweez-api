import mongoose, { Schema, Document } from 'mongoose';

export interface IQuiz extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  topicId: mongoose.Types.ObjectId;
  mode: 'scheduled' | 'manual' | 'live';
  status: 'draft' | 'scheduled' | 'open' | 'closed' | 'waiting' | 'in_progress' | 'finished';
  duration: number; // in minutes
  scheduledOpen?: Date;
  scheduledClose?: Date;
  attemptLimit: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowBacktrack: boolean;
  showAnswerKey: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const quizSchema = new Schema<IQuiz>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    mode: { type: String, required: true, enum: ['scheduled', 'manual', 'live'], default: 'manual' },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'scheduled', 'open', 'closed', 'waiting', 'in_progress', 'finished'],
      default: 'draft',
    },
    duration: { type: Number, required: true, default: 30 },
    scheduledOpen: { type: Date },
    scheduledClose: { type: Date },
    attemptLimit: { type: Number, default: 1 },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    allowBacktrack: { type: Boolean, default: true },
    showAnswerKey: { type: Boolean, default: false },
  },
  { timestamps: true }
);

quizSchema.index({ topicId: 1 });
quizSchema.index({ status: 1 });

export const Quiz = mongoose.model<IQuiz>('Quiz', quizSchema);
