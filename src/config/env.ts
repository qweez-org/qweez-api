import dotenv from 'dotenv';
dotenv.config();

// Validate required env vars at startup
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/qweez',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  REFRESH_TOKEN_COOKIE_NAME: process.env.REFRESH_TOKEN_COOKIE_NAME || 'qweez_refresh',
  REFRESH_TOKEN_COOKIE_SECURE: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
  // Comma-separated list of allowed origins. Example: "http://localhost:5173,https://app.example.com"
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
