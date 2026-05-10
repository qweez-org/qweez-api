import { Class } from '../models/Class.js';
import { Membership } from '../models/Membership.js';
import { Quiz } from '../models/Quiz.js';
import { Topic } from '../models/Topic.js';

type UserLike = { _id: any; role: 'teacher' | 'student' };

type QuizContext = {
  quiz: any;
  topic: any;
  cls: any;
};

export async function getClassForUser(classId: string, user: UserLike): Promise<any | null> {
  const cls = await Class.findById(classId);
  if (!cls) return null;

  const userId = user._id.toString();
  if (cls.owner.toString() === userId) return cls;

  const membership = await Membership.findOne({
    userId: user._id,
    classId: cls._id,
    status: 'approved',
  });

  return membership ? cls : null;
}

export async function getManageableClassForTeacher(classId: string, user: UserLike): Promise<any | null> {
  if (user.role !== 'teacher') return null;

  const cls = await Class.findById(classId);
  if (!cls) return null;

  const userId = user._id.toString();
  if (cls.owner.toString() === userId) return cls;

  const coTeach = await Membership.findOne({
    userId: user._id,
    classId: cls._id,
    role: 'co-teacher',
    status: 'approved',
  });

  return coTeach ? cls : null;
}

export async function getQuizContextForUser(quizId: string, user: UserLike): Promise<QuizContext | null> {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) return null;

  const topic = await Topic.findById(quiz.topicId);
  if (!topic) return null;

  const cls = await getClassForUser(topic.classId.toString(), user);
  if (!cls) return null;

  return { quiz, topic, cls };
}
