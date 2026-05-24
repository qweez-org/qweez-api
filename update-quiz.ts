import mongoose from 'mongoose';
import { Quiz } from './src/models/Quiz.js';

async function run() {
  await mongoose.connect('mongodb+srv://admin:admin123@cluster0.gk9efe1.mongodb.net/qweez?retryWrites=true&w=majority&appName=Cluster0');
  const quiz = await Quiz.findOne();
  if (quiz) {
    quiz.mode = 'scheduled';
    quiz.status = 'scheduled';
    quiz.scheduledOpen = new Date(Date.now() - 3600000); // 1 hour ago
    quiz.scheduledClose = new Date(Date.now() + 86400000); // 24 hours from now
    quiz.title = "Tes Kuis Terjadwal (Aktif)";
    await quiz.save();
    console.log('Updated a quiz to be an active scheduled quiz!');
  } else {
    console.log('No quiz found.');
  }
  process.exit(0);
}
run();
