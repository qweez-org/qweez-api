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

    RefreshToken.deleteMany({}),
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEACHERS — diverse backgrounds
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('👨‍🏫 Creating teachers...');
  const teacherDefs = [
    // Scenario A: High-school teacher using Qweez for her math & physics classes
    { name: 'Siti Rahayu',        email: 'siti.rahayu@gmail.com' },
    // Scenario B: University lecturer – one class only
    { name: 'Dr. Budi Santoso',   email: 'budi.santoso@unpad.ac.id' },
    // Scenario C: Tutoring center "Bintang Pelajar" — owner + staff
    { name: 'Ahmad Wijaya',       email: 'ahmad@bintangpelajar.id' },
    { name: 'Dewi Lestari',       email: 'dewi@bintangpelajar.id' },
    // Scenario D: Freelance English tutor
    { name: 'Rina Kartika',       email: 'rina.kartika@outlook.com' },
    // Scenario E: Corporate trainer
    { name: 'Eko Prasetyo',       email: 'eko.prasetyo@tigerhr.co.id' },
    // Scenario F: Community coding bootcamp instructor
    { name: 'Fajar Nugroho',      email: 'fajar@kodeinaja.org' },
    // Scenario G: Religious school teacher
    { name: 'Ustadzah Hana',      email: 'hana.mdta@ymail.com' },
    // Scenario H: Homeschool parent
    { name: 'Mega Putri',         email: 'megaputri.hs@gmail.com' },
    // Scenario I: Retired teacher doing volunteer tutoring
    { name: 'Pak Joko',           email: 'joko.subroto@yahoo.co.id' },
  ];
  const teachers = await User.create(
    teacherDefs.map((t) => ({ ...t, password: 'password123', role: 'teacher' }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  STUDENTS — varied email providers & naming styles
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🎓 Creating students...');
  const studentList: { name: string; email: string }[] = [
    // High-school students (Siti's classes)
    { name: 'Andi Saputra',       email: 'andi.saputra11@gmail.com' },
    { name: 'Bella Permata',      email: 'bella.p@siswa.sma5bdg.sch.id' },
    { name: 'Cahyo Wibowo',       email: 'cahyow@yahoo.com' },
    { name: 'Dina Marlina',       email: 'dinamarlina@outlook.com' },
    { name: 'Erik Setiawan',      email: 'erik.setiawan@gmail.com' },
    { name: 'Fani Rahmawati',     email: 'fani.r@siswa.sma5bdg.sch.id' },
    { name: 'Galih Purnomo',      email: 'galih_purnomo@gmail.com' },
    { name: 'Hesti Yulianti',     email: 'hesti.yuli@ymail.com' },
    { name: 'Irwan Hidayat',      email: 'irwan.h2010@gmail.com' },
    { name: 'Julia Sari',         email: 'julia.sari@outlook.com' },
    // University students (Dr. Budi's class)
    { name: 'Kevin Wijaya',       email: 'kevin.w@student.unpad.ac.id' },
    { name: 'Laras Ayu',          email: 'larasayu22@gmail.com' },
    { name: 'Mahesa Putra',       email: 'mahesa.p@student.unpad.ac.id' },
    { name: 'Nabila Azzahra',     email: 'nabilazz@icloud.com' },
    { name: 'Oscar Firmansyah',   email: 'oscar.f@student.unpad.ac.id' },
    // Tutoring center students (Bintang Pelajar)
    { name: 'Putri Handayani',    email: 'putri.h@gmail.com' },
    { name: 'Qori Amalia',        email: 'qoriamalia@yahoo.co.id' },
    { name: 'Rizky Aditya',       email: 'rizky.aditya@outlook.com' },
    { name: 'Santi Dewi',         email: 'santi.dewi99@gmail.com' },
    { name: 'Taufik Rahman',      email: 'taufik.r@ymail.com' },
    { name: 'Ulya Maharani',      email: 'ulya.maharani@gmail.com' },
    { name: 'Vega Pratama',       email: 'vega.pratama@outlook.com' },
    { name: 'Winda Lestari',      email: 'windalestari@gmail.com' },
    // English tutor students (Rina's class)
    { name: 'Xander Mahendra',    email: 'xander.m@gmail.com' },
    { name: 'Yanti Susanti',      email: 'yanti.susanti@icloud.com' },
    { name: 'Zahra Ayu',          email: 'zahraayu@yahoo.com' },
    // Corporate trainees (Eko's class)
    { name: 'Arif Budiman',       email: 'arif.budiman@tigerhr.co.id' },
    { name: 'Bunga Citra',        email: 'bunga.citra@tigerhr.co.id' },
    { name: 'Chandra Halim',      email: 'chandra.h@tigerhr.co.id' },
    { name: 'Diana Putri',        email: 'diana.putri@tigerhr.co.id' },
    // Coding bootcamp students (Fajar's class)
    { name: 'Elang Saputra',      email: 'elang@protonmail.com' },
    { name: 'Fira Nuraini',       email: 'fira.dev@gmail.com' },
    { name: 'Gilang Ramadhan',    email: 'gilang.r@outlook.com' },
    { name: 'Hana Safitri',       email: 'hana.code@gmail.com' },
    { name: 'Ivan Kurniawan',     email: 'ivan.k@protonmail.com' },
    // Religious school students (Ustadzah Hana's class)
    { name: 'Jasmine Aulia',      email: 'jasmine.aulia@gmail.com' },
    { name: 'Khadijah Nur',       email: 'khadijah.nur@yahoo.com' },
    { name: 'Luthfi Hakim',       email: 'luthfi.h@gmail.com' },
    { name: 'Maryam Safira',      email: 'maryam.s@outlook.com' },
    // Homeschool kids (Mega's class)
    { name: 'Naufal Rizki',       email: 'naufal.r.hs@gmail.com' },
    { name: 'Olive Putri',        email: 'olive.putri.hs@gmail.com' },
    // Volunteer tutoring students (Pak Joko's class)
    { name: 'Prasetyo Adi',       email: 'prasetyo.adi@gmail.com' },
    { name: 'Qonita Zahra',       email: 'qonitaz@ymail.com' },
    { name: 'Raka Darmawan',      email: 'raka.d@outlook.com' },
    // Extra students that join multiple classes
    { name: 'Salma Khaira',       email: 'salma.khaira@gmail.com' },
    { name: 'Tegar Prakoso',      email: 'tegar.p@yahoo.co.id' },
    { name: 'Umi Habibah',        email: 'umi.h@gmail.com' },
    { name: 'Vino Ardiansyah',    email: 'vino.ardi@outlook.com' },
    { name: 'Wulan Sari',         email: 'wulan.sari@icloud.com' },
    { name: 'Yuda Permana',       email: 'yuda.permana@gmail.com' },
  ];
  const students = await User.create(
    studentList.map((s) => ({ ...s, password: 'password123', role: 'student' }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLASSES — each represents a different real-world scenario
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🏫 Creating classes...');
  const classDefs = [
    // Siti (0): high-school teacher with 2 subject classes
    { name: 'Matematika Kelas 11A',       desc: 'Pelajaran Matematika SMA kelas 11A semester genap',        owner: 0 },
    { name: 'Fisika Kelas 11A',           desc: 'Pelajaran Fisika SMA kelas 11A',                          owner: 0 },
    // Budi (1): university lecturer with 1 class
    { name: 'Statistika Terapan S1',      desc: 'Mata kuliah Statistika Terapan, Prodi Teknik Industri',    owner: 1 },
    // Ahmad (2) + Dewi (3): tutoring center with 2 groups
    { name: 'Bintang Pelajar — SMP',      desc: 'Les persiapan ujian SMP (semua mapel)',                    owner: 2 },
    { name: 'Bintang Pelajar — SMA IPA',  desc: 'Les SMA jurusan IPA (Matematika, Fisika, Kimia, Biologi)',owner: 2 },
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
  //  MEMBERSHIPS — deliberate student-to-class mapping per scenario
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('👥 Creating memberships...');
  const membershipDocs: any[] = [];
  // Map: classIndex → array of student indices
  const classStudentMap: number[][] = [
    /* 0  Matematika 11A */   [0,1,2,3,4,5,6,7,8,9],
    /* 1  Fisika 11A */       [0,1,2,3,4,5,6,7,8,9],
    /* 2  Statistika S1 */    [10,11,12,13,14],
    /* 3  BP SMP */           [15,16,17,18,19],
    /* 4  BP SMA IPA */       [15,16,17,18,19,20,21,22,45,46],
  ];

  for (let ci = 0; ci < classes.length; ci++) {
    for (const si of classStudentMap[ci]) {
      membershipDocs.push({ userId: students[si]._id, classId: classes[ci]._id, role: 'student', status: 'approved' });
    }
  }

  // Pending join requests
  const pendingPairs: [number, number][] = [
    [44, 0], // Salma wants to join Matematika 11A
    [46, 2], // Umi wants to join Statistika S1
    [49, 4], // Yuda wants to join BP SMA IPA
  ];
  for (const [si, ci] of pendingPairs) {
    if (!classStudentMap[ci].includes(si)) {
      membershipDocs.push({ userId: students[si]._id, classId: classes[ci]._id, role: 'student', status: 'pending' });
    }
  }

  // Co-teachers
  membershipDocs.push(
    { userId: teachers[3]._id, classId: classes[3]._id, role: 'co-teacher', status: 'approved' }, // Dewi co-teaches BP SMP (Ahmad's)
    { userId: teachers[3]._id, classId: classes[4]._id, role: 'co-teacher', status: 'approved' }, // Dewi co-teaches BP SMA IPA
  );

  await Membership.create(membershipDocs);

  // ═══════════════════════════════════════════════════════════════════════════
  //  TOPICS — realistic per class scenario
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📁 Creating topics...');
  const topicDefs: { name: string; ci: number }[] = [
    // Matematika 11A (0)
    { name: 'Matriks', ci: 0 }, { name: 'Barisan & Deret', ci: 0 }, { name: 'Limit Fungsi', ci: 0 },
    // Fisika 11A (1)
    { name: 'Hukum Newton', ci: 1 }, { name: 'Usaha & Energi', ci: 1 }, { name: 'Momentum & Impuls', ci: 1 },
    // Statistika S1 (2)
    { name: 'Statistik Deskriptif', ci: 2 }, { name: 'Probabilitas', ci: 2 }, { name: 'Regresi Linear', ci: 2 },
    // BP SMP (3)
    { name: 'Matematika SMP', ci: 3 }, { name: 'IPA SMP', ci: 3 }, { name: 'Bahasa Indonesia SMP', ci: 3 },
    // BP SMA IPA (4)
    { name: 'Matematika IPA', ci: 4 }, { name: 'Fisika', ci: 4 }, { name: 'Kimia', ci: 4 }, { name: 'Biologi', ci: 4 },
  ];
  const topics = await Topic.create(
    topicDefs.map((t) => ({ name: t.name, classId: classes[t.ci]._id }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUIZZES — explicit statuses, mostly open/closed for visible data
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📝 Creating quizzes...');
  // Weighted status: 50% open, 25% closed, 15% draft, 10% scheduled
  const statusPool: Array<{ mode: string; status: string }> = [
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'open' },
    { mode: 'manual', status: 'closed' },
    { mode: 'manual', status: 'closed' },
    { mode: 'manual', status: 'closed' },
    { mode: 'manual', status: 'closed' },
    { mode: 'manual', status: 'closed' },
    { mode: 'manual', status: 'draft' },
    { mode: 'manual', status: 'draft' },
    { mode: 'manual', status: 'draft' },
    { mode: 'scheduled', status: 'scheduled' },
    { mode: 'scheduled', status: 'scheduled' },
  ];

  const quizDefs: any[] = [];
  const quizTopicIndex: number[] = [];

  for (let ti = 0; ti < topics.length; ti++) {
    const count = randBetween(1, 2);
    for (let q = 0; q < count; q++) {
      const st = pick(statusPool);
      const dur = pick([10, 15, 20, 25, 30, 45, 60]);
      const quiz: any = {
        title: `${topics[ti].name} — Kuis ${q + 1}`,
        topicId: topics[ti]._id,
        mode: st.mode,
        status: st.status,
        duration: dur,
        attemptLimit: pick([1, 1, 2, 3]),
        shuffleQuestions: Math.random() > 0.3, // Mostly true
        shuffleOptions: Math.random() > 0.4, // Mostly true
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
  //  QUESTIONS — 3-5 per quiz, always created (including drafts)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('❓ Creating questions...');
  const mcTemplates = [
    { t: 'Manakah pernyataan berikut yang benar tentang {topic}?',
      opts: ['Pernyataan A (benar)', 'Pernyataan B', 'Pernyataan C', 'Pernyataan D'] },
    { t: 'Apa yang dimaksud dengan konsep utama dalam {topic}?',
      opts: ['Definisi yang tepat', 'Jawaban kurang tepat 1', 'Jawaban kurang tepat 2', 'Jawaban kurang tepat 3'] },
    { t: 'Contoh penerapan {topic} dalam kehidupan sehari-hari adalah...',
      opts: ['Contoh tepat', 'Contoh kurang tepat 1', 'Contoh kurang tepat 2', 'Contoh kurang tepat 3'] },
    { t: 'Berikut yang BUKAN merupakan bagian dari {topic} adalah...',
      opts: ['Bukan bagian (benar)', 'Bagian 1', 'Bagian 2', 'Bagian 3'] },
    { t: 'Prinsip dasar dari {topic} dapat dirumuskan sebagai...',
      opts: ['Rumusan benar', 'Rumusan salah 1', 'Rumusan salah 2', 'Rumusan salah 3'] },
    { t: 'Hasil perhitungan yang berkaitan dengan {topic} adalah...',
      opts: ['Jawaban benar', 'Jawaban salah 1', 'Jawaban salah 2', 'Jawaban salah 3'] },
  ];
  const shortAnswerTemplates = [
    { t: 'Tuliskan secara singkat konsep utama dari {topic}.', ans: ['konsep penting', 'jawaban pendek'] },
    { t: 'Berikan satu contoh penerapan {topic}.', ans: ['contoh A', 'contoh B', 'contoh nyata'] },
    { t: 'Apa nama istilah lain dari {topic}?', ans: ['istilah sinonim', 'nama lain'] },
  ];

  const questionDocs: any[] = [];
  for (let qi = 0; qi < quizzes.length; qi++) {
    const topicName = topics[quizTopicIndex[qi]].name;
    const qCount = randBetween(3, 5);
    for (let qo = 0; qo < qCount; qo++) {
      if (qo === qCount - 1 && Math.random() > 0.5) {
        const tmpl = pick(shortAnswerTemplates);
        questionDocs.push({
          quizId: quizzes[qi]._id, type: 'short_answer',
          text: tmpl.t.replace('{topic}', topicName),
          points: pick([15, 20, 25]), order: qo,
          caseSensitive: Math.random() > 0.8,
          spaceSensitive: Math.random() > 0.8,
          options: tmpl.ans.map((a: string) => ({ text: a, isCorrect: true })),
        });
      } else {
        const tmpl = pick(mcTemplates);
        questionDocs.push({
          quizId: quizzes[qi]._id, type: 'multiple_choice',
          text: tmpl.t.replace('{topic}', topicName),
          points: 10, order: qo,
          options: tmpl.opts.map((text, i) => ({ text, isCorrect: i === 0 })),
        });
      }
    }
  }
  const questions = await Question.create(questionDocs);
  console.log(`   → ${questions.length} questions created`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  ATTEMPTS & ANSWERS — only for open/closed quizzes
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📊 Creating attempts and answers...');
  const attemptBulk: any[] = [];
  const answerBulk: any[] = [];

  function classIndexForQuiz(qi: number): number {
    return topicDefs[quizTopicIndex[qi]].ci;
  }

  for (let qi = 0; qi < quizzes.length; qi++) {
    const quiz = quizzes[qi];
    if (quiz.status !== 'open' && quiz.status !== 'closed') continue;

    const ci = classIndexForQuiz(qi);
    const enrolled = classStudentMap[ci].map((si) => students[si]);
    const quizQs = questions.filter((q: any) => q.quizId.toString() === quiz._id.toString());
    if (quizQs.length === 0) continue;

    const attemptCount = Math.max(1, Math.ceil(enrolled.length * (0.6 + Math.random() * 0.35)));
    const attemptStudents = enrolled.slice(0, attemptCount);

    for (const student of attemptStudents) {
      const startedAt = daysAgo(randBetween(1, 21));
      const elapsedMin = Math.max(1, randBetween(3, quiz.duration));
      const submittedAt = new Date(startedAt.getTime() + elapsedMin * 60000);

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
          const correctAns = q.options[0].text;
          const correct = Math.random() > 0.4;
          const pts = correct ? q.points : 0;
          earnedPts += pts;
          tempAnswers.push({ questionId: q._id, answer: correct ? correctAns : 'Jawaban salah', isCorrect: correct, points: pts });
        }
      }

      attemptBulk.push({
        userId: student._id, quizId: quiz._id,
        status: 'submitted', startedAt, submittedAt,
        score: earnedPts, totalPoints: totalPts,
        _tempAnswers: tempAnswers,
      });
    }
  }

  const attempts = await Attempt.create(attemptBulk.map(({ _tempAnswers, ...rest }) => rest));

  for (let i = 0; i < attempts.length; i++) {
    for (const a of attemptBulk[i]._tempAnswers || []) {
      answerBulk.push({ attemptId: attempts[i]._id, ...a });
    }
  }
  if (answerBulk.length > 0) {
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

  for (let ci = 0; ci < classes.length; ci++) {
    for (const si of classStudentMap[ci]) {
      notifDocs.push({
        userId: students[si]._id, type: 'join_approved',
        title: `Bergabung ke ${classes[ci].name}`,
        message: `Permintaan bergabung ke kelas "${classes[ci].name}" telah disetujui.`,
        classId: classes[ci]._id, isRead: Math.random() > 0.25,
      });
    }
  }

  for (let qi = 0; qi < quizzes.length; qi++) {
    if (quizzes[qi].status !== 'open' && quizzes[qi].status !== 'closed') continue;
    const ci = classIndexForQuiz(qi);
    for (const si of classStudentMap[ci]) {
      notifDocs.push({
        userId: students[si]._id, type: 'quiz_open',
        title: `Kuis Dibuka: ${quizzes[qi].title}`,
        message: `Kuis "${quizzes[qi].title}" sekarang tersedia.`,
        quizId: quizzes[qi]._id, isRead: Math.random() > 0.4,
      });
    }
  }

  for (const [si, ci] of pendingPairs) {
    const ownerIdx = classDefs[ci].owner;
    notifDocs.push({
      userId: teachers[ownerIdx]._id, type: 'join_request',
      title: 'Permintaan Bergabung',
      message: `${students[si].name} ingin bergabung ke kelas "${classes[ci].name}".`,
      classId: classes[ci]._id, isRead: false,
    });
  }

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
  console.log('   Teachers:');
  for (const t of teacherDefs) console.log(`     ${t.email.padEnd(35)} (${t.name})`);
  console.log('   Students (sample):');
  console.log(`     ${studentList[0].email.padEnd(35)} (${studentList[0].name})`);
  console.log(`     ${studentList[10].email.padEnd(35)} (${studentList[10].name})`);
  console.log(`     ${studentList[15].email.padEnd(35)} (${studentList[15].name})`);
  console.log(`     ${studentList[30].email.padEnd(35)} (${studentList[30].name})`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
