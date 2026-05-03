import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Class } from './models/Class.js';
import { Membership } from './models/Membership.js';
import { Topic } from './models/Topic.js';
import { Quiz } from './models/Quiz.js';
import { Question } from './models/Question.js';
import { Attempt } from './models/Attempt.js';
import { Answer } from './models/Answer.js';
import { Notification } from './models/Notification.js';
import { TeacherAssignment } from './models/TeacherAssignment.js';

const seed = async () => {
  console.log('\n🌱 Qweez Seed Script');
  console.log('⚠️  This will drop ALL existing data!\n');

  await connectDB();

  // Drop all collections
  await User.deleteMany({});
  await Class.deleteMany({});
  await Membership.deleteMany({});
  await Topic.deleteMany({});
  await Quiz.deleteMany({});
  await Question.deleteMany({});
  await Attempt.deleteMany({});
  await Answer.deleteMany({});
  await Notification.deleteMany({});
  await TeacherAssignment.deleteMany({});
  console.log('🗑️  Cleared all collections');

  // === USERS ===
  const teacher1 = await User.create({ name: 'Pak Ahmad', email: 'ahmad@qweez.id', password: 'password123', role: 'teacher' });
  const teacher2 = await User.create({ name: 'Bu Siti', email: 'siti@qweez.id', password: 'password123', role: 'teacher' });
  const students = await User.create([
    { name: 'Budi Santoso', email: 'budi@siswa.id', password: 'password123', role: 'student' },
    { name: 'Dewi Lestari', email: 'dewi@siswa.id', password: 'password123', role: 'student' },
    { name: 'Eko Prasetyo', email: 'eko@siswa.id', password: 'password123', role: 'student' },
    { name: 'Fitri Handayani', email: 'fitri@siswa.id', password: 'password123', role: 'student' },
    { name: 'Gunawan Wibowo', email: 'gunawan@siswa.id', password: 'password123', role: 'student' },
  ]);
  console.log(`👤 Created ${2} teachers and ${students.length} students`);

  // === CLASSES ===
  const class1 = await Class.create({ name: 'Kelas 10A — IPA', description: 'Kelas Ilmu Pengetahuan Alam semester ganjil', code: 'QWZ10A', owner: teacher1._id });
  const class2 = await Class.create({ name: 'Kelas 11B — Bahasa', description: 'Kelas Bahasa Indonesia & Inggris', code: 'QWZ11B', owner: teacher1._id });
  console.log(`🏫 Created ${2} classes`);

  // === MEMBERSHIPS ===
  // All 5 students approved in class1
  for (const student of students) {
    await Membership.create({ userId: student._id, classId: class1._id, role: 'student', status: 'approved' });
  }
  // 3 students in class2 (2 pending)
  await Membership.create({ userId: students[0]._id, classId: class2._id, role: 'student', status: 'approved' });
  await Membership.create({ userId: students[1]._id, classId: class2._id, role: 'student', status: 'approved' });
  await Membership.create({ userId: students[2]._id, classId: class2._id, role: 'student', status: 'approved' });
  await Membership.create({ userId: students[3]._id, classId: class2._id, role: 'student', status: 'pending' });
  await Membership.create({ userId: students[4]._id, classId: class2._id, role: 'student', status: 'pending' });

  // Co-teacher: Bu Siti co-teaches in class1
  await Membership.create({ userId: teacher2._id, classId: class1._id, role: 'co-teacher', status: 'approved' });
  console.log(`🤝 Created memberships`);

  // === TOPICS ===
  const topicMath = await Topic.create({ name: 'Matematika', classId: class1._id });
  const topicFisika = await Topic.create({ name: 'Fisika', classId: class1._id });
  const topicBindo = await Topic.create({ name: 'Bahasa Indonesia', classId: class2._id });
  console.log(`📚 Created 3 topics`);

  // === TEACHER ASSIGNMENTS ===
  await TeacherAssignment.create({ teacherId: teacher1._id, topicId: topicMath._id, classId: class1._id });
  await TeacherAssignment.create({ teacherId: teacher2._id, topicId: topicFisika._id, classId: class1._id });
  await TeacherAssignment.create({ teacherId: teacher1._id, topicId: topicBindo._id, classId: class2._id });

  // === QUIZZES ===
  const quiz1 = await Quiz.create({
    title: 'UTS Matematika Bab 1-3',
    description: 'Ujian Tengah Semester — Aljabar dan Geometri',
    topicId: topicMath._id,
    mode: 'manual',
    status: 'closed',
    duration: 60,
    attemptLimit: 1,
  });

  const quiz2 = await Quiz.create({
    title: 'Kuis Harian — Persamaan Linear',
    topicId: topicMath._id,
    mode: 'manual',
    status: 'open',
    duration: 20,
    attemptLimit: 2,
  });

  const quiz3 = await Quiz.create({
    title: 'Ujian Hukum Newton',
    description: 'Hukum Newton I, II, III dan penerapan',
    topicId: topicFisika._id,
    mode: 'live',
    status: 'draft',
    duration: 45,
    attemptLimit: 1,
  });

  const quiz4 = await Quiz.create({
    title: 'Kuis Sastra Indonesia',
    topicId: topicBindo._id,
    mode: 'manual',
    status: 'closed',
    duration: 30,
    attemptLimit: 1,
  });
  console.log(`📝 Created 4 quizzes`);

  // === QUESTIONS ===
  const q1a = await Question.create({
    quizId: quiz1._id, type: 'multiple_choice', text: 'Berapakah hasil dari 2x + 3 = 11?', points: 10, order: 0,
    options: [{ text: 'x = 3', isCorrect: false }, { text: 'x = 4', isCorrect: true }, { text: 'x = 5', isCorrect: false }, { text: 'x = 6', isCorrect: false }],
  });
  const q1b = await Question.create({
    quizId: quiz1._id, type: 'multiple_choice', text: 'Luas segitiga dengan alas 6 dan tinggi 8 adalah...', points: 10, order: 1,
    options: [{ text: '24', isCorrect: true }, { text: '48', isCorrect: false }, { text: '14', isCorrect: false }, { text: '36', isCorrect: false }],
  });
  const q1c = await Question.create({
    quizId: quiz1._id, type: 'multiple_choice', text: 'Jika f(x) = 3x² + 2, maka f(2) = ...', points: 10, order: 2,
    options: [{ text: '8', isCorrect: false }, { text: '14', isCorrect: true }, { text: '12', isCorrect: false }, { text: '16', isCorrect: false }],
  });
  const q1d = await Question.create({
    quizId: quiz1._id, type: 'essay', text: 'Jelaskan langkah-langkah menyelesaikan persamaan kuadrat menggunakan rumus abc!', points: 20, order: 3,
    options: [],
  });

  const q2a = await Question.create({
    quizId: quiz2._id, type: 'multiple_choice', text: 'Penyelesaian dari 3x - 7 = 8 adalah...', points: 10, order: 0,
    options: [{ text: 'x = 5', isCorrect: true }, { text: 'x = 3', isCorrect: false }, { text: 'x = 7', isCorrect: false }, { text: 'x = 1', isCorrect: false }],
  });
  const q2b = await Question.create({
    quizId: quiz2._id, type: 'multiple_choice', text: 'Gradien garis y = 2x + 5 adalah...', points: 10, order: 1,
    options: [{ text: '5', isCorrect: false }, { text: '2', isCorrect: true }, { text: '7', isCorrect: false }, { text: '1', isCorrect: false }],
  });

  const q3a = await Question.create({
    quizId: quiz3._id, type: 'multiple_choice', text: 'Hukum Newton I disebut juga...', points: 10, order: 0,
    options: [{ text: 'Hukum Aksi-Reaksi', isCorrect: false }, { text: 'Hukum Inersia', isCorrect: true }, { text: 'Hukum Percepatan', isCorrect: false }, { text: 'Hukum Gravitasi', isCorrect: false }],
  });
  const q3b = await Question.create({
    quizId: quiz3._id, type: 'multiple_choice', text: 'Rumus Hukum Newton II adalah...', points: 10, order: 1,
    options: [{ text: 'F = m × a', isCorrect: true }, { text: 'F = m × v', isCorrect: false }, { text: 'F = m × g', isCorrect: false }, { text: 'F = m / a', isCorrect: false }],
  });

  const q4a = await Question.create({
    quizId: quiz4._id, type: 'multiple_choice', text: 'Siapakah penulis novel "Laskar Pelangi"?', points: 10, order: 0,
    options: [{ text: 'Pramoedya Ananta Toer', isCorrect: false }, { text: 'Andrea Hirata', isCorrect: true }, { text: 'Tere Liye', isCorrect: false }, { text: 'Dee Lestari', isCorrect: false }],
  });
  const q4b = await Question.create({
    quizId: quiz4._id, type: 'multiple_choice', text: 'Majas yang membandingkan dua hal secara langsung disebut...', points: 10, order: 1,
    options: [{ text: 'Personifikasi', isCorrect: false }, { text: 'Hiperbola', isCorrect: false }, { text: 'Metafora', isCorrect: true }, { text: 'Litotes', isCorrect: false }],
  });
  console.log(`❓ Created ${10} questions`);

  // === ATTEMPTS & ANSWERS (for quiz1 and quiz4 — closed quizzes) ===
  const createAttempt = async (userId: mongoose.Types.ObjectId, quizId: mongoose.Types.ObjectId, questions: any[], answerMap: Record<number, string>) => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000);
    const submittedAt = new Date(Date.now() - 5 * 60 * 1000);

    const attempt = await Attempt.create({
      userId, quizId, status: 'submitted', startedAt, submittedAt,
    });

    let score = 0;
    let totalPoints = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      totalPoints += q.points;
      const answerText = answerMap[i] || '';

      if (q.type === 'multiple_choice') {
        const correctOption = q.options.find((o: any) => o.isCorrect);
        const isCorrect = correctOption && answerText === correctOption.text;
        const pts = isCorrect ? q.points : 0;
        if (isCorrect) score += q.points;

        await Answer.create({
          attemptId: attempt._id, questionId: q._id, answer: answerText, isCorrect, points: pts,
        });
      } else {
        // Essay — leave ungraded
        await Answer.create({
          attemptId: attempt._id, questionId: q._id, answer: answerText,
        });
      }
    }

    attempt.score = score;
    attempt.totalPoints = totalPoints;
    await attempt.save();
    return attempt;
  };

  const quiz1Questions = [q1a, q1b, q1c, q1d];

  // Student attempts for quiz1
  await createAttempt(students[0]._id, quiz1._id, quiz1Questions, { 0: 'x = 4', 1: '24', 2: '14', 3: 'Gunakan rumus x = (-b ± √(b²-4ac)) / 2a' });
  await createAttempt(students[1]._id, quiz1._id, quiz1Questions, { 0: 'x = 4', 1: '24', 2: '12', 3: 'Menggunakan rumus abc' });
  await createAttempt(students[2]._id, quiz1._id, quiz1Questions, { 0: 'x = 3', 1: '24', 2: '14', 3: 'Rumus kuadrat abc' });
  await createAttempt(students[3]._id, quiz1._id, quiz1Questions, { 0: 'x = 4', 1: '48', 2: '14', 3: 'Substitusi dan diskriminan' });
  await createAttempt(students[4]._id, quiz1._id, quiz1Questions, { 0: 'x = 5', 1: '48', 2: '12', 3: 'Tidak tahu' });

  const quiz4Questions = [q4a, q4b];

  // Student attempts for quiz4
  await createAttempt(students[0]._id, quiz4._id, quiz4Questions, { 0: 'Andrea Hirata', 1: 'Metafora' });
  await createAttempt(students[1]._id, quiz4._id, quiz4Questions, { 0: 'Andrea Hirata', 1: 'Personifikasi' });
  await createAttempt(students[2]._id, quiz4._id, quiz4Questions, { 0: 'Tere Liye', 1: 'Metafora' });

  console.log(`📊 Created attempts with scores`);

  // === NOTIFICATIONS ===
  await Notification.create([
    { userId: students[0]._id, type: 'join_approved', title: 'Bergabung ke kelas', message: 'Anda diterima di kelas Kelas 10A — IPA', classId: class1._id, isRead: true },
    { userId: students[3]._id, type: 'quiz_result', title: 'Hasil Kuis', message: 'Hasil UTS Matematika Bab 1-3: 20/50', quizId: quiz1._id, isRead: false },
    { userId: teacher1._id, type: 'quiz_new', title: 'Kuis dibuat', message: 'Kuis "Kuis Harian — Persamaan Linear" berhasil dibuat', quizId: quiz2._id, isRead: true },
  ]);
  console.log(`🔔 Created notifications`);

  console.log('\n✅ Seed complete!\n');
  console.log('📋 Login credentials:');
  console.log('   Teacher: ahmad@qweez.id / password123');
  console.log('   Teacher: siti@qweez.id / password123');
  console.log('   Student: budi@siswa.id / password123');
  console.log('   (all students use password123)\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
