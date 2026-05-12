import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Class } from './models/Class.js';
import { Membership } from './models/Membership.js';
import { Topic } from './models/Topic.js';
import { Quiz } from './models/Quiz.js';
import { Question } from './models/Question.js';
import { Attempt } from './models/Attempt.js';
import { Answer } from './models/Answer.js';
import { Notification } from './models/Notification.js';
import { LiveResult } from './models/LiveResult.js';
import { RefreshToken } from './models/RefreshToken.js';
import { env } from './config/env.js';
import { generateClassCode } from './utils/generateCode.js';

// ─── Helpers ──────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function daysAgo(d: number) { return new Date(Date.now() - d * 86400000); }
function randBetween(lo: number, hi: number) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

async function seed() {
  console.log('🌱 Connecting to database...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected');

  // Clear all collections
  console.log('🗑️  Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Class.deleteMany({}),
    Membership.deleteMany({}),
    Topic.deleteMany({}),
    Quiz.deleteMany({}),
    Question.deleteMany({}),
    Attempt.deleteMany({}),
    Answer.deleteMany({}),
    Notification.deleteMany({}),
    LiveResult.deleteMany({}),
    RefreshToken.deleteMany({}),
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  USERS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('👨‍🏫 Creating 10 teachers...');
  const teacherDefs = [
    { name: 'Budi Santoso',      email: 'budi@teacher.com' },
    { name: 'Siti Rahayu',       email: 'siti@teacher.com' },
    { name: 'Ahmad Wijaya',      email: 'ahmad@teacher.com' },
    { name: 'Dewi Lestari',      email: 'dewi.l@teacher.com' },
    { name: 'Eko Prasetyo',      email: 'eko@teacher.com' },
    { name: 'Fitriani Nuraini',  email: 'fitri@teacher.com' },
    { name: 'Gunawan Saputra',   email: 'gunawan@teacher.com' },
    { name: 'Heni Wulandari',    email: 'heni@teacher.com' },
    { name: 'Irfan Hakim',       email: 'irfan@teacher.com' },
    { name: 'Joko Susanto',      email: 'joko@teacher.com' },
  ];
  const teachers = await User.create(
    teacherDefs.map((t) => ({ ...t, password: 'password123', role: 'teacher' }))
  );

  console.log('🎓 Creating 50 students...');
  const studentNames = [
    'Rina Putri','Dimas Prasetyo','Maya Sari','Fajar Nugroho','Ani Lestari',
    'Reza Firmansyah','Dewi Anggraini','Hendra Gunawan','Nadia Safitri','Oki Pramana',
    'Putri Handayani','Qori Amalia','Rahmat Hidayat','Sari Mulyani','Taufik Hidayat',
    'Umi Kalsum','Vina Melati','Wahyu Setiawan','Xena Puspita','Yusuf Maulana',
    'Zahra Ayu','Bayu Pratama','Citra Dewi','Dani Kurniawan','Elia Rahmawati',
    'Farhan Ramadhan','Gita Nirmala','Hari Wibowo','Indah Permata','Jihan Aulia',
    'Kevin Saputra','Lina Marlina','Miko Ardiansyah','Nisa Fitriani','Oscar Tanaka',
    'Pandu Wijaya','Qiara Salsabila','Rizky Aditya','Sinta Purnama','Toni Hermawan',
    'Ulfa Maharani','Vicky Ananda','Winda Lestari','Xander Mahendra','Yanti Susanti',
    'Zaki Mubarak','Alya Rahma','Brama Satria','Cantika Dewi','Daffa Pratama',
  ];
  const students = await User.create(
    studentNames.map((name, i) => ({
      name,
      email: `student${i + 1}@student.com`,
      password: 'password123',
      role: 'student',
    }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLASSES  (15 classes spread across teachers)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🏫 Creating 15 classes...');
  const classDefs = [
    { name: 'Matematika Dasar',     desc: 'Aljabar, geometri, dan statistika dasar',     owner: 0 },
    { name: 'Kalkulus I',           desc: 'Limit, turunan, dan integral',                owner: 0 },
    { name: 'Fisika Dasar',        desc: 'Mekanika dan termodinamika',                  owner: 1 },
    { name: 'Fisika Modern',       desc: 'Relativitas dan mekanika kuantum',            owner: 1 },
    { name: 'Bahasa Indonesia',    desc: 'Tata bahasa, sastra, dan penulisan',          owner: 2 },
    { name: 'Bahasa Inggris',      desc: 'Grammar, reading, dan writing',               owner: 2 },
    { name: 'Sejarah Indonesia',   desc: 'Dari kerajaan Nusantara hingga Reformasi',    owner: 3 },
    { name: 'Biologi SMA',        desc: 'Sel, genetika, ekologi, dan evolusi',          owner: 4 },
    { name: 'Kimia Dasar',        desc: 'Atom, ikatan kimia, stoikiometri',             owner: 5 },
    { name: 'Ekonomi Mikro',      desc: 'Permintaan, penawaran, dan pasar',             owner: 6 },
    { name: 'Geografi',           desc: 'Litosfer, atmosfer, hidrosfer',                owner: 7 },
    { name: 'Informatika',        desc: 'Algoritma, pemrograman dasar, dan basis data', owner: 8 },
    { name: 'Seni Budaya',        desc: 'Seni rupa, musik, dan tari Nusantara',        owner: 9 },
    { name: 'Pendidikan Kewarganegaraan', desc: 'Pancasila, UUD 1945, hak & kewajiban', owner: 3 },
    { name: 'Sosiologi',          desc: 'Struktur sosial, konflik, dan perubahan',      owner: 6 },
  ];
  const classes = await Class.create(
    classDefs.map((c) => ({
      name: c.name,
      description: c.desc,
      code: generateClassCode(),
      owner: teachers[c.owner]._id,
    }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  MEMBERSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('👥 Creating memberships...');
  const membershipDocs: any[] = [];

  // Spread students across classes: each class gets 12-30 students
  const classStudentMap: number[][] = [];
  for (let ci = 0; ci < classes.length; ci++) {
    const size = randBetween(12, Math.min(30, students.length));
    const offset = (ci * 7) % students.length;
    const indices: number[] = [];
    for (let s = 0; s < size; s++) {
      indices.push((offset + s) % students.length);
    }
    classStudentMap.push([...new Set(indices)]);
    for (const si of classStudentMap[ci]) {
      membershipDocs.push({ userId: students[si]._id, classId: classes[ci]._id, role: 'student', status: 'approved' });
    }
  }

  // Pending join requests (8 total)
  const pendingPairs = [
    [42, 0],[43, 1],[44, 2],[45, 3],[46, 7],[47, 8],[48, 11],[49, 14],
  ];
  for (const [si, ci] of pendingPairs) {
    if (!classStudentMap[ci].includes(si)) {
      membershipDocs.push({ userId: students[si]._id, classId: classes[ci]._id, role: 'student', status: 'pending' });
    }
  }

  // Co-teachers (6 assignments)
  const coTeacherPairs = [[1,0],[2,1],[0,2],[4,3],[5,7],[8,9]];
  for (const [ti, ci] of coTeacherPairs) {
    membershipDocs.push({ userId: teachers[ti]._id, classId: classes[ci]._id, role: 'co-teacher', status: 'approved' });
  }

  await Membership.create(membershipDocs);

  // ═══════════════════════════════════════════════════════════════════════════
  //  TOPICS  (~40 topics)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📁 Creating topics...');
  const topicDefs: { name: string; ci: number }[] = [
    // Matematika Dasar (0)
    { name: 'Aljabar', ci: 0 },{ name: 'Geometri', ci: 0 },{ name: 'Statistika', ci: 0 },
    // Kalkulus I (1)
    { name: 'Limit Fungsi', ci: 1 },{ name: 'Turunan', ci: 1 },{ name: 'Integral', ci: 1 },
    // Fisika Dasar (2)
    { name: 'Mekanika', ci: 2 },{ name: 'Termodinamika', ci: 2 },{ name: 'Gelombang', ci: 2 },
    // Fisika Modern (3)
    { name: 'Relativitas Khusus', ci: 3 },{ name: 'Mekanika Kuantum', ci: 3 },
    // Bahasa Indonesia (4)
    { name: 'Tata Bahasa', ci: 4 },{ name: 'Sastra', ci: 4 },{ name: 'Penulisan Kreatif', ci: 4 },
    // Bahasa Inggris (5)
    { name: 'Grammar', ci: 5 },{ name: 'Reading Comprehension', ci: 5 },{ name: 'Essay Writing', ci: 5 },
    // Sejarah Indonesia (6)
    { name: 'Kerajaan Hindu-Buddha', ci: 6 },{ name: 'Kolonialisme', ci: 6 },{ name: 'Kemerdekaan', ci: 6 },
    // Biologi SMA (7)
    { name: 'Sel & Jaringan', ci: 7 },{ name: 'Genetika', ci: 7 },{ name: 'Ekologi', ci: 7 },
    // Kimia Dasar (8)
    { name: 'Struktur Atom', ci: 8 },{ name: 'Ikatan Kimia', ci: 8 },{ name: 'Stoikiometri', ci: 8 },
    // Ekonomi Mikro (9)
    { name: 'Permintaan & Penawaran', ci: 9 },{ name: 'Elastisitas', ci: 9 },{ name: 'Struktur Pasar', ci: 9 },
    // Geografi (10)
    { name: 'Litosfer', ci: 10 },{ name: 'Atmosfer', ci: 10 },{ name: 'Hidrosfer', ci: 10 },
    // Informatika (11)
    { name: 'Algoritma', ci: 11 },{ name: 'Pemrograman Dasar', ci: 11 },{ name: 'Basis Data', ci: 11 },
    // Seni Budaya (12)
    { name: 'Seni Rupa', ci: 12 },{ name: 'Seni Musik', ci: 12 },
    // PKN (13)
    { name: 'Pancasila', ci: 13 },{ name: 'UUD 1945', ci: 13 },
    // Sosiologi (14)
    { name: 'Struktur Sosial', ci: 14 },{ name: 'Perubahan Sosial', ci: 14 },
  ];
  const topics = await Topic.create(
    topicDefs.map((t) => ({ name: t.name, classId: classes[t.ci]._id }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUIZZES  (~60 quizzes)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📝 Creating quizzes...');
  const statuses: Array<{ mode: string; status: string }> = [
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'closed' },
    { mode: 'manual', status: 'draft' },
    { mode: 'scheduled', status: 'scheduled' },
  ];

  const quizDefs: any[] = [];
  const quizTopicIndex: number[] = []; // track which topic each quiz belongs to

  for (let ti = 0; ti < topics.length; ti++) {
    // 1-2 quizzes per topic
    const count = randBetween(1, 2);
    for (let q = 0; q < count; q++) {
      const st = pick(statuses);
      const dur = pick([10, 15, 20, 25, 30]);
      const quiz: any = {
        title: `${topics[ti].name} - Kuis ${q + 1}`,
        topicId: topics[ti]._id,
        mode: st.mode,
        status: st.status,
        duration: dur,
        attemptLimit: pick([1, 1, 2, 3]),
        shuffleQuestions: Math.random() > 0.7,
        allowBacktrack: Math.random() > 0.2,
      };
      if (st.mode === 'scheduled') {
        quiz.scheduledOpen = new Date(Date.now() + 86400000);
        quiz.scheduledClose = new Date(Date.now() + 3 * 86400000);
      }
      quizDefs.push(quiz);
      quizTopicIndex.push(ti);
    }
  }
  const quizzes = await Quiz.create(quizDefs);
  console.log(`   → ${quizzes.length} quizzes created`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUESTIONS (3-5 per quiz)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('❓ Creating questions...');
  const mcTemplates = [
    { t: 'Manakah pernyataan berikut yang benar tentang {topic}?', opts: ['Pernyataan A (benar)', 'Pernyataan B', 'Pernyataan C', 'Pernyataan D'] },
    { t: 'Apa yang dimaksud dengan konsep utama dalam {topic}?', opts: ['Definisi yang tepat', 'Definisi tidak tepat 1', 'Definisi tidak tepat 2', 'Definisi tidak tepat 3'] },
    { t: 'Contoh penerapan {topic} dalam kehidupan sehari-hari adalah...', opts: ['Contoh tepat', 'Contoh kurang tepat 1', 'Contoh kurang tepat 2', 'Contoh kurang tepat 3'] },
    { t: 'Siapa tokoh yang paling berkaitan dengan {topic}?', opts: ['Tokoh yang benar', 'Tokoh lain 1', 'Tokoh lain 2', 'Tokoh lain 3'] },
    { t: 'Rumus atau prinsip dasar dari {topic} adalah...', opts: ['Rumus benar', 'Rumus salah 1', 'Rumus salah 2', 'Rumus salah 3'] },
  ];
  const essayTemplates = [
    'Jelaskan konsep utama dari {topic} dengan kata-kata sendiri.',
    'Berikan 3 contoh penerapan {topic} dalam kehidupan nyata.',
    'Bandingkan dan kontraskan dua aspek penting dalam {topic}.',
    'Analisislah hubungan antara {topic} dengan bidang ilmu lain.',
  ];

  const questionDocs: any[] = [];
  for (let qi = 0; qi < quizzes.length; qi++) {
    const quiz = quizzes[qi];
    const topicName = topics[quizTopicIndex[qi]].name;
    const qCount = randBetween(3, 5);
    for (let qo = 0; qo < qCount; qo++) {
      if (qo === qCount - 1 && Math.random() > 0.4) {
        // Essay question (last question, ~60% chance)
        const tmpl = pick(essayTemplates);
        questionDocs.push({
          quizId: quiz._id,
          type: 'essay',
          text: tmpl.replace('{topic}', topicName),
          points: pick([15, 20, 25]),
          order: qo,
          options: [],
        });
      } else {
        const tmpl = pick(mcTemplates);
        questionDocs.push({
          quizId: quiz._id,
          type: 'multiple_choice',
          text: tmpl.t.replace('{topic}', topicName),
          points: 10,
          order: qo,
          options: tmpl.opts.map((text, i) => ({ text, isCorrect: i === 0 })),
        });
      }
    }
  }
  const questions = await Question.create(questionDocs);
  console.log(`   → ${questions.length} questions created`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  ATTEMPTS & ANSWERS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📊 Creating attempts and answers...');
  const attemptBulk: any[] = [];
  const answerBulk: any[] = [];

  // Build quiz → classIndex map via topicDefs
  function classIndexForQuiz(qi: number): number {
    return topicDefs[quizTopicIndex[qi]].ci;
  }

  for (let qi = 0; qi < quizzes.length; qi++) {
    const quiz = quizzes[qi];
    if (quiz.status === 'draft' || quiz.status === 'scheduled') continue;

    const ci = classIndexForQuiz(qi);
    const enrolled = classStudentMap[ci].map((si) => students[si]);
    const quizQs = questions.filter((q: any) => q.quizId.toString() === quiz._id.toString());
    if (quizQs.length === 0) continue;

    // 55-90% of enrolled students attempt
    const attemptCount = Math.max(1, Math.ceil(enrolled.length * (0.55 + Math.random() * 0.35)));
    const attemptStudents = enrolled.slice(0, attemptCount);

    for (const student of attemptStudents) {
      const startedAt = daysAgo(randBetween(1, 14));
      const submittedAt = new Date(startedAt.getTime() + randBetween(3, quiz.duration) * 60000);

      let totalPts = 0;
      let earnedPts = 0;
      const tempAnswers: any[] = [];

      for (const q of quizQs) {
        totalPts += q.points;
        if (q.type === 'multiple_choice') {
          const correct = Math.random() > 0.3;
          const correctOpt = q.options.find((o: any) => o.isCorrect);
          const wrongOpts = q.options.filter((o: any) => !o.isCorrect);
          const chosen = correct
            ? (correctOpt?.text || q.options[0]?.text || '')
            : (pick(wrongOpts)?.text || '');
          const pts = correct ? q.points : 0;
          earnedPts += pts;
          tempAnswers.push({ questionId: q._id, answer: chosen, isCorrect: correct, points: pts });
        } else {
          const pts = Math.floor(Math.random() * (q.points + 1));
          earnedPts += pts;
          tempAnswers.push({ questionId: q._id, answer: 'Jawaban esai dari siswa.', isCorrect: pts >= q.points * 0.5, points: pts });
        }
      }

      attemptBulk.push({
        userId: student._id,
        quizId: quiz._id,
        status: 'submitted',
        startedAt,
        submittedAt,
        score: earnedPts,
        totalPoints: totalPts,
        _tempAnswers: tempAnswers,
      });
    }
  }

  // Insert attempts
  const attempts = await Attempt.create(attemptBulk.map(({ _tempAnswers, ...rest }) => rest));

  // Insert answers
  for (let i = 0; i < attempts.length; i++) {
    const ans = attemptBulk[i]._tempAnswers || [];
    for (const a of ans) {
      answerBulk.push({ attemptId: attempts[i]._id, ...a });
    }
  }
  if (answerBulk.length > 0) {
    // Insert in batches to avoid memory issues
    const BATCH = 500;
    for (let i = 0; i < answerBulk.length; i += BATCH) {
      await Answer.insertMany(answerBulk.slice(i, i + BATCH));
    }
  }
  console.log(`   → ${attempts.length} attempts, ${answerBulk.length} answers`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🔔 Creating notifications...');
  const notifDocs: any[] = [];

  // join_approved for every approved student membership
  for (let ci = 0; ci < classes.length; ci++) {
    for (const si of classStudentMap[ci]) {
      notifDocs.push({
        userId: students[si]._id,
        type: 'join_approved',
        title: `Bergabung ke ${classes[ci].name}`,
        message: `Permintaan bergabung ke kelas "${classes[ci].name}" telah disetujui.`,
        classId: classes[ci]._id,
        isRead: Math.random() > 0.25,
      });
    }
  }

  // quiz_open for open quizzes
  for (let qi = 0; qi < quizzes.length; qi++) {
    if (quizzes[qi].status !== 'open' && quizzes[qi].status !== 'closed') continue;
    const ci = classIndexForQuiz(qi);
    for (const si of classStudentMap[ci]) {
      notifDocs.push({
        userId: students[si]._id,
        type: 'quiz_open',
        title: `Kuis Dibuka: ${quizzes[qi].title}`,
        message: `Kuis "${quizzes[qi].title}" sekarang tersedia.`,
        quizId: quizzes[qi]._id,
        isRead: Math.random() > 0.4,
      });
    }
  }

  // join_request notifications for pending members → class owner
  for (const [si, ci] of pendingPairs) {
    const ownerIdx = classDefs[ci].owner;
    notifDocs.push({
      userId: teachers[ownerIdx]._id,
      type: 'join_request',
      title: 'Permintaan Bergabung',
      message: `${students[si].name} ingin bergabung ke kelas "${classes[ci].name}".`,
      classId: classes[ci]._id,
      isRead: false,
    });
  }

  // Insert notifications in batches
  const NBATCH = 500;
  for (let i = 0; i < notifDocs.length; i += NBATCH) {
    await Notification.insertMany(notifDocs.slice(i, i + NBATCH));
  }
  console.log(`   → ${notifDocs.length} notifications`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n✅ Seed complete!');
  console.log(`   Teachers:      ${teachers.length}`);
  console.log(`   Students:      ${students.length}`);
  console.log(`   Classes:       ${classes.length}`);
  console.log(`   Topics:        ${topics.length}`);
  console.log(`   Quizzes:       ${quizzes.length}`);
  console.log(`   Questions:     ${questions.length}`);
  console.log(`   Attempts:      ${attempts.length}`);
  console.log(`   Answers:       ${answerBulk.length}`);
  console.log(`   Notifications: ${notifDocs.length}`);
  console.log(`   Memberships:   ${membershipDocs.length}`);
  console.log('\n📌 Login credentials (password: password123):');
  console.log('   Teachers: budi@teacher.com, siti@teacher.com, ahmad@teacher.com, ...');
  console.log('   Students: student1@student.com through student50@student.com');
  console.log('   First student: student1@student.com (Rina Putri)');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
