import mongoose, { Schema, Document } from 'mongoose';

export interface IClass extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  code: string;
  owner: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const classSchema = new Schema<IClass>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Class = mongoose.model<IClass>('Class', classSchema);
