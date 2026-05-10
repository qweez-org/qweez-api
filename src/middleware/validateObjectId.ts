import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

export function validateObjectIdParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = (req.params as any)[paramName];
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
      res.status(400).json({ message: `Invalid ${paramName}` });
      return;
    }
    next();
  };
}
