import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacherAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  topicId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const teacherAssignmentSchema = new Schema<ITeacherAssignment>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  },
  { timestamps: true }
);

teacherAssignmentSchema.index({ teacherId: 1, topicId: 1 }, { unique: true });

export const TeacherAssignment = mongoose.model<ITeacherAssignment>('TeacherAssignment', teacherAssignmentSchema);
