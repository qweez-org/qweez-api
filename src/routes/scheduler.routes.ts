import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { runScheduler } from '../utils/scheduler.js';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const secret = req.headers['x-cron-secret'];
  
  // If CRON_SECRET is defined, verify it. If not, maybe log a warning but allow for now
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    res.status(401).json({ message: 'Unauthorized cron request' });
    return;
  }

  try {
    const io = req.app.get('io');
    await runScheduler(io);
    res.status(200).json({ message: 'Scheduler run successfully' });
  } catch (err) {
    console.error('Scheduler route error:', err);
    res.status(500).json({ message: 'Internal server error during scheduler run' });
  }
});

export default router;
