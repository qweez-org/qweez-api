import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  // Mongoose duplicate key error
  if ((err as any).code === 11000) {
    res.status(409).json({ message: 'Duplicate entry. Resource already exists.' });
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    res.status(400).json({ message: err.message });
    return;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({ message: 'Invalid ID format' });
    return;
  }

  res.status(500).json({ message: 'Internal server error' });
};
