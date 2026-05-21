// ─── Live Quiz Handler (Facade / Re-exports) ──────────────────────────────
// The monolithic live quiz handler has been split into 3 focused modules:
//   • liveQuizStore.ts    — session storage, CRUD, cleanup
//   • liveQuizGrading.ts  — answer grading, leaderboard, end-session persistence
//   • liveQuizBroadcaster.ts — Socket.IO event handlers
//
// This file re-exports the public API for backward compatibility.
// New code should import from the sub-modules directly.

export type {
  Participant,
  StudentAnswer,
  LiveSession,
} from './liveQuizStore.js';

export {
  getSessions,
  getQuizIdToPin,
  getSessionByQuizId,
  getSessionByPin,
  createLiveSession,
  cancelLiveSession,
} from './liveQuizStore.js';

export {
  sanitizeQuestion,
  buildLeaderboard,
  gradeAnswer,
  endQuizSession,
} from './liveQuizGrading.js';

export {
  registerLiveQuizHandlers,
} from './liveQuizBroadcaster.js';
