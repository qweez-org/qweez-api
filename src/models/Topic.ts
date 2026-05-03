import mongoose, { Schema, Document } from 'mongoose';

export interface ITopic extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  classId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const topicSchema = new Schema<ITopic>(
  {
    name: { type: String, required: true, trim: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  },
  { timestamps: true }
);

export const Topic = mongoose.model<ITopic>('Topic', topicSchema);
