# terminal_agent
WALKTHROUGH

Setup API Key Global
Fitur keliling (portabilitas mesin) pada agen CLI Anda sudah berhasil diterapkan! Anda kini bisa mempublikasikan source code aplikasi agen ini di GitHub, melakukan git clone di mesin baru, dan menjalankannya tanpa pusing mengatur GEMINI_API_KEY secara manual.

🌟 Cara Kerja Setup Interaktif
Saat Anda pertama kali menjalankan perintah myagent di PC atau laptop baru:

Skrip akan mencek nilai GEMINI_API_KEY di mesin.
Jika tidak ditemukan, agen langsung mem-pause proses loading internal dan memunculkan prompt terminal: 🔑 Masukkan Gemini API Key (dapatkan di https://aistudio.google.com):
Setelah Anda paste dan tekan Enter, nilai tersebut langsung di-save ke dalam file rahasia Global OS Anda: ~/.myagent.env (Misalnya di C:\Users\NamaAnda\.myagent.env atau /Users/Mac/.myagent.env).
Kunci otomatis dimuat ulang untuk membiarkan session CLI berjalan mulus tanpa error.
Pada run selanjutnya, Anda tidak akan pernah ditanyai API Key lagi karena key tersebut otomatis dimuat dari profil global Anda di mesin itu!
TIP

Cara Distribusi ke Mesin Lain:

Clone repository GitHub Anda: git clone https://...
Pindah ke direktori: cd terminal_agent
Daftarkan terminal command global: npm link
Ketik: myagent
Agen akan menuntun Anda memasukkan API Key secara mandiri. File konfigurasi (.env) tak perlu disertakan ke Github karena sekarang ia bisa menginisiasi profil keamanannya secara cerdas!
