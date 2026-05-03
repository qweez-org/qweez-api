import mongoose, { Schema, Document } from 'mongoose';

export interface IQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface IQuestion extends Document {
  _id: mongoose.Types.ObjectId;
  quizId: mongoose.Types.ObjectId;
  type: 'multiple_choice' | 'essay';
  text: string;
  options: IQuestionOption[];
  points: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    type: { type: String, required: true, enum: ['multiple_choice', 'essay'], default: 'multiple_choice' },
    text: { type: String, required: true },
    options: [
      {
        text: { type: String, required: true },
        isCorrect: { type: Boolean, required: true, default: false },
      },
    ],
    points: { type: Number, required: true, default: 10 },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export const Question = mongoose.model<IQuestion>('Question', questionSchema);
