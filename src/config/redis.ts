import { createClient, type RedisClientType } from 'redis';
import { env } from './env.js';

// ─── Shared Redis Client ────────────────────────────────────────────────────
// Used for live quiz session storage and Socket.IO adapter.
// In development without REDIS_URL the live quiz store falls back to in-memory.

let redisClient: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType | null> {
  if (!env.REDIS_URL) {
    console.warn('\x1b[33m[redis] No REDIS_URL set — live quiz sessions will use in-memory storage (single-instance only)\x1b[0m');
    return null;
  }

  redisClient = createClient({ url: env.REDIS_URL }) as RedisClientType;

  redisClient.on('error', (err) => {
    console.error('\x1b[31m[redis] Client error:\x1b[0m', err);
  });

  await redisClient.connect();
  console.log(`\x1b[32m🔗 Redis connected:\x1b[0m ${env.REDIS_URL}`);
  return redisClient;
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}
