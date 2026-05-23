export const specificQuestions: Record<string, { t: string, type: string, opts?: string[], ans?: string[], isTrue?: boolean }[]> = {
  'Matriks': [
    { t: 'Determinan dari matriks identitas adalah...', type: 'multiple_choice', opts: ['1', '0', '-1', 'Tak terdefinisi'] },
    { t: 'Syarat dua matriks dapat dikalikan adalah jumlah kolom matriks pertama sama dengan jumlah baris matriks kedua.', type: 'true_false', isTrue: true },
    { t: 'Matriks yang memiliki baris dan kolom yang sama jumlahnya disebut matriks...', type: 'short_answer', ans: ['Persegi', 'Matriks Persegi'] },
    { t: 'Invers dari matriks singular selalu ada.', type: 'true_false', isTrue: false },
    { t: 'Matriks dengan satu baris saja disebut matriks baris.', type: 'true_false', isTrue: true },
  ],
  'Barisan & Deret': [
    { t: 'Rumus suku ke-n pada barisan aritmetika adalah...', type: 'multiple_choice', opts: ['Un = a + (n-1)b', 'Un = a * r^(n-1)', 'Sn = n/2 (a + Un)', 'Un = a + nb'] },
    { t: 'Deret geometri tak hingga mempunyai jumlah jika rasionya berada di antara -1 dan 1.', type: 'true_false', isTrue: true },
    { t: 'Jika a = 2 dan b = 3, maka U5 pada barisan aritmetika tersebut adalah...', type: 'short_answer', ans: ['14'] },
    { t: 'Suku pertama dari suatu barisan sering disimbolkan dengan huruf apa?', type: 'short_answer', ans: ['a', 'A'] },
    { t: 'Deret adalah jumlah dari suku-suku suatu barisan.', type: 'true_false', isTrue: true }
  ],
  'Limit Fungsi': [
    { t: 'Jika substitusi langsung menghasilkan 0/0, teknik yang bisa digunakan adalah...', type: 'multiple_choice', opts: ['L\'Hopital', 'Integral', 'Logaritma', 'Matriks'] },
    { t: 'Limit x menuju tak hingga dari 1/x adalah 0.', type: 'true_false', isTrue: true },
    { t: 'Nilai dari limit x mendekati 2 untuk 3x adalah...', type: 'short_answer', ans: ['6'] },
  ],
  'Hukum Newton': [
    { t: 'Hukum yang menyatakan bahwa setiap aksi ada reaksi yang sama besar dan berlawanan arah adalah...', type: 'multiple_choice', opts: ['Hukum Newton III', 'Hukum Newton I', 'Hukum Newton II', 'Hukum Gravitasi'] },
    { t: 'Satuan standar gaya (SI) dinamakan...', type: 'short_answer', ans: ['Newton', 'N'] },
    { t: 'Sebuah benda yang diam akan tetap diam jika tidak ada resultan gaya yang bekerja padanya.', type: 'true_false', isTrue: true },
    { t: 'Hukum Newton II dirumuskan sebagai F = m * v.', type: 'true_false', isTrue: false }
  ],
  'Statistik Deskriptif': [
    { t: 'Nilai tengah dari sekumpulan data yang telah diurutkan disebut...', type: 'multiple_choice', opts: ['Median', 'Modus', 'Mean', 'Varians'] },
    { t: 'Modus adalah nilai yang paling sering muncul dalam suatu data.', type: 'true_false', isTrue: true },
    { t: 'Rata-rata dari kumpulan data disebut juga...', type: 'short_answer', ans: ['Mean', 'Rata-rata'] },
  ]
};

export const genericQuestions = [
  { t: 'Konsep dasar dari {topic} sangat bergantung pada observasi empiris.', type: 'true_false', isTrue: true },
  { t: 'Manakah dari berikut ini yang merupakan karakteristik utama dari {topic}?', type: 'multiple_choice', opts: ['Karakteristik A (benar)', 'Karakteristik B', 'Karakteristik C', 'Karakteristik D'] },
  { t: 'Sebutkan salah satu istilah kunci dalam {topic}.', type: 'short_answer', ans: ['istilah', 'kunci', 'konsep'] },
  { t: '{topic} mulai berkembang pesat pada awal abad ke-20.', type: 'true_false', isTrue: false },
  { t: 'Metode analisis standar dalam {topic} meliputi pendekatan...', type: 'multiple_choice', opts: ['Kuantitatif dan Kualitatif', 'Hanya Deskriptif', 'Eksperimen Acak Saja', 'Spekulatif'] },
  { t: 'Prinsip utama yang melandasi {topic} adalah...', type: 'multiple_choice', opts: ['Prinsip Benar', 'Prinsip Salah 1', 'Prinsip Salah 2', 'Prinsip Salah 3'] },
  { t: 'Tidak ada aplikasi nyata dari {topic} dalam industri modern.', type: 'true_false', isTrue: false },
  { t: 'Jelaskan tujuan utama dari penerapan {topic}.', type: 'short_answer', ans: ['tujuan utama', 'memecahkan masalah', 'efisiensi'] },
  { t: 'Implementasi {topic} seringkali dibatasi oleh anggaran dan sumber daya manusia.', type: 'true_false', isTrue: true },
  { t: 'Salah satu tantangan terbesar dalam memelajari {topic} adalah...', type: 'multiple_choice', opts: ['Kompleksitas teori', 'Kurangnya buku', 'Tidak ada guru', 'Terlalu mudah'] }
];
