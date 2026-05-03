import mongoose, { Schema, Document } from 'mongoose';

export interface IMembership extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  role: 'student' | 'co-teacher';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<IMembership>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    role: { type: String, required: true, enum: ['student', 'co-teacher'] },
    status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, classId: 1 }, { unique: true });

export const Membership = mongoose.model<IMembership>('Membership', membershipSchema);
