import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: 'join_request' | 'join_approved' | 'join_rejected' | 'quiz_new' | 'quiz_open' | 'quiz_closed' | 'quiz_result' | 'live_quiz' | 'live_quiz_finished';
  title: string;
  message: string;
  classId?: mongoose.Types.ObjectId;
  quizId?: mongoose.Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      required: true,
      enum: ['join_request', 'join_approved', 'join_rejected', 'quiz_new', 'quiz_open', 'quiz_closed', 'quiz_result', 'live_quiz', 'live_quiz_finished'],
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class' },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
