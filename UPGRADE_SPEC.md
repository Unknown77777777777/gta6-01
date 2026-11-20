# MASTER UPGRADE SPECIFICATION: COSTA SOL (2.5D EDITION)

## 1. KONTEKS & TARGET KOMPETISI
- **Proyek:** "Make GTA 6: open-world crime game in Costa Sol" (Kompetisi `gta6-01`)[span_1](start_span)[span_1](end_span).
- **Tujuan Utama:** Meningkatkan *win-rate* pada evaluasi **pairwise AI judge** untuk menembus skor **> 992.057 (Top 100)** hingga **> 994.000 (Rank 1)** dari posisi saat ini di **987.355**[span_2](start_span)[span_2](end_span).
- **Aturan Keras (WAJIB DIPATUHI):**
  1. **100% Kode Orisinal:** Dilarang menyalin kode dari entri lain atau aset/kode berhak cipta pihak ketiga[span_3](start_span)[span_3](end_span). Semua visual, fisika, dan audio harus dibangun secara prosedural menggunakan kode sendiri.
  2. **Zero Network Requests:** Game harus berjalan 100% mandiri (*offline/self-contained*) tanpa memuat gambar, font, atau audio eksternal dari internet[span_4](start_span)[span_4](end_span).
  3. **Single Clean Build:** Seluruh perubahan harus selesai dan teruji tuntas sebelum proses *build* & *sealed recording* terakhir[span_5](start_span)[span_5](end_span).

---

## 2. PROTOKOL EKSEKUSI MANDIRI UNTUK AI AGENT
Sebelum menulis kode baru, jalankan urutan kerja berikut secara otonom:
1. **Inspeksi Struktur Kode:** Baca seluruh file sumber di repositori lokal untuk memetakan *game loop*, *camera system*, *entity manager*, *mission state machine*, dan *WebAudio synthesizer*.
2. **Implementasi Bertahap (Fase 1 → Fase 4):** Kerjakan setiap fase di bawah ini secara modular agar tidak merusak fitur yang sudah lolos 30 *intake checks* (jalan kaki/lari, nyetir + handbrake, curi mobil `E`, AI lalu lintas/pejalan kaki, wanted 0–5, combat `F` + pistol aim mouse, HUD, minimap, save/load `localStorage`)[span_6](start_span)[span_6](end_span).
3. **Verifikasi Otomatis End-to-End:** Setelah semua fase selesai, jalankan pengujian otomatis tanpa *teleport* untuk memastikan Misi 1–6 berjalan mulus dari awal hingga tamat dengan 0 *runtime error* dan stabil di 60 FPS.

---

## 3. FASE 1: AUDIT & PERBAIKAN MISI 1–6 END-TO-END (PRIORITAS TERTINGGI)
Misi 2–6 sebelumnya baru diverifikasi menggunakan *teleport*[span_7](start_span)[span_7](end_span). AI judge menilai secara *pairwise*, sehingga satu *soft-lock* atau kebingungan arah akan langsung menurunkan *win-rate*[span_8](start_span)[span_8](end_span).

### Tugas Implementasi:
1. **Validasi State Machine Misi 1–6 (Alur Lena Cruz & Utang $2000 ke Marco Venn)**[span_9](start_span)[span_9](end_span):
   - Periksa seluruh kondisi pemicu (*trigger zones*, *NPC targets*, *vehicle delivery*, *combat encounters*, dan *mission timers*) pada Misi 1 hingga Misi 6.
   - **Anti Soft-Lock Safeguard:**
     - Jika kendaraan target misi hancur atau terjebak di luar jangkauan, munculkan kendaraan pengganti di titik terdekat atau berikan pesan objektif yang jelas agar misi tidak macet permanen.
     - Pastikan saat pemain *wasted* (HP 0) atau *busted* (ditangkap polisi) dan melakukan *respawn*[span_10](start_span)[span_10](end_span), *state* misi aktif ter-reset dengan bersih (tidak ada duplikasi NPC/mobil misi atau *timer* ganda).
     - Pastikan progres pelunasan utang $2000 ke Marco Venn[span_11](start_span)[span_11](end_span) terhubung secara nyata dengan hadiah uang dari tiap misi dan tersimpan akurat di `localStorage`[span_12](start_span)[span_12](end_span).
2. **Diegetic GPS Waypoint Arrow (Sangat Penting untuk AI Judge & Pemain):**
   - Selain titik di minimap[span_13](start_span)[span_13](end_span), gambar **panah penunjuk arah dinamis** pada radius ~75px mengelilingi Lena Cruz (atau mobil yang sedang dikendarai) yang selalu mengarah ke koordinat objektif misi aktif.
   - Tampilkan jarak dalam meter (misal: `145m`) tepat di bawah panah atau di panel objektif HUD agar arah tujuan langsung terbaca dalam 1 detik pertama permainan.

---

## 4. FASE 2: UPGRADE VISUAL KE 2.5D NEO-NOIR & DYNAMIC LIGHTING
Untuk mengungguli entri 3D di papan atas tanpa merombak *engine* fisika 2D[span_14](start_span)[span_14](end_span), ubah tampilan *flat top-down* menjadi **2.5D Perspective (Gaya Klasik GTA 2)** dengan pencahayaan atmosferik.

### Tugas Implementasi:
1. **2.5D Extruded Building Roofs (Paralaks Perspektif):**
   - Untuk setiap blok bangunan di peta 4800×3600[span_15](start_span)[span_15](end_span), hitung pergeseran koordinat atap berdasarkan jarak pusat bangunan terhadap pusat kamera (`camX, camY`):
     ```javascript
     const parallaxFactor = 0.14; // Tinggi visual gedung
     const roofX = building.x + (building.centerX - camX) * parallaxFactor;
     const roofY = building.y + (building.centerY - camY) * parallaxFactor;
     ```
   - Gambar sisi dinding 3D yang menghubungkan sudut dasar bangunan (`building.x, building.y`) ke sudut atap (`roofX, roofY`) dengan gradasi warna lebih gelap (efek bayangan sisi gedung), lalu gambar permukaan atap di lapisan paling atas lengkap dengan detail prosedural (ventilasi AC, *helipad*, atau papan neon).
   - *Optimasi:* Lakukan *frustum culling* (hanya render bangunan yang berada dalam radius layar + margin 300px) agar tetap 60 FPS.
2. **Procedural Surface Textures (Offscreen Canvas Caching):**
   - Buat *texture generator* menggunakan offscreen `<canvas>` saat inisialisasi game (0 network request)[span_16](start_span)[span_16](end_span) untuk mengganti warna blok polos menjadi:
     - Aspal bertekstur halus dengan garis marka jalan putus-putus, *zebra cross*, dan trotoar bertepi.
     - Tekstur pasir pantai dengan animasi garis ombak bergerak di tepi laut serta dermaga kayu di area pelabuhan[span_17](start_span)[span_17](end_span).
3. **Dynamic Lighting & Atmosphere Layer:**
   - Tambahkan siklus waktu halus (**Golden Sunset → Neon Night**) atau pencahayaan senja-malam yang kontras:
     - **Drop Shadows:** Bayangan gelap lembut di bawah setiap mobil, pejalan kaki, dan gedung.
     - **Vehicle Headlights:** Kerucut cahaya (*radial/cone gradient* menggunakan `globalCompositeOperation = 'lighter'`) di depan setiap mobil.
     - **Police Sirens:** Kilatan cahaya merah dan biru berputar yang memantul di atas aspal saat mobil polisi mengejar (*wanted level* 1–5)[span_18](start_span)[span_18](end_span).
     - **Streetlamps & Neon:** Titik cahaya hangat di sepanjang jalan utama, pantai, dan pelabuhan[span_19](start_span)[span_19](end_span).

---

## 5. FASE 3: GAME FEEL ("JUICE"), VARIASI KENDARAAN & WEBAUDIO RADIO
Perkuat sensasi fisik dan audio agar setiap aksi (nyetir, tabrakan, menembak, kejar-kejaran) terasa responsif dan hidup.

### Tugas Implementasi:
1. **Physics Feedback & Particle System:**
   - **Tire Skid Marks:** Simpan array koordinat jejak ban hitam semi-transparan di aspal saat mobil melakukan *handbrake*[span_20](start_span)[span_20](end_span) atau berbelok tajam pada kecepatan tinggi.
   - **Vehicle Damage States:** Tambahkan asap putih saat HP mobil < 60%, asap hitam tebal + percikan api saat HP < 30%, dan ledakan partikel + *screen shake* saat HP mencapai 0 (mengeluarkan pemain otomatis dengan HP berkurang jika masih di dalam).
   - **Combat Juice:** Tambahkan *muzzle flash* (kilatan tembakan), garis peluru (*bullet tracer*), partikel percikan saat peluru mengenai dinding/mobil, dan *floating text popup* (`+$150`, `WANTED ★`, `MISSION COMPLETE`) yang melayang naik dan memudar.
2. **Diferensiasi Kelas Kendaraan:**
   - Pastikan lalu lintas kota memiliki minimal 4 kelas kendaraan dengan warna, dimensi, dan parameter fisika (*topSpeed, acceleration, turnRate, mass*) yang berbeda: **Compact**, **Sedan**, **Sports Car** (cepat & tajam), dan **Police Interceptor** (agresif saat *wanted level* naik)[span_21](start_span)[span_21](end_span).
3. **WebAudio Procedural Car Radio:**
   - Manfaatkan mesin *synth* WebAudio yang sudah ada[span_22](start_span)[span_22](end_span) untuk membuat **3 Stasiun Radio Prosedural** (misal: `1. COSTA SYNTHWAVE`, `2. HARBOR LO-FI`, `3. POLICE SCANNER`) yang otomatis menyala saat Lena masuk ke mobil dan dapat diganti dengan tombol `R`.
   - Tampilkan *banner* nama stasiun radio bergaya klasik di bagian atas layar selama 2,5 detik setiap kali masuk mobil atau mengganti stasiun.

---

## 6. FASE 4: VERIFIKASI & QUALITY ASSURANCE CHECKLIST
Sebelum menyerahkan hasil akhir untuk proses *sealed recording*[span_23](start_span)[span_23](end_span), wajib lulus seluruh pemeriksaan berikut:
- [ ] **Zero Console Errors:** Tidak ada error atau warning kritis di konsol browser selama permainan berlangsung.
- [ ] **Zero Network Requests:** Pastikan tab Network menunjukkan 0 permintaan eksternal[span_24](start_span)[span_24](end_span).
- [ ] **Full Playthrough Misi 1–6:** Misi 1 sampai 6 dapat diselesaikan berurutan dengan input standar (`WASD`/Panah, `E`, `F`, `R`, Mouse) tanpa *teleport*[span_25](start_span)[span_25](end_span).
- [ ] **Framerate Stability:** Tetap stabil di 60 FPS pada resolusi standar meskipun banyak mobil polisi dan efek pencahayaan aktif.
- [ ] **UI & HUD Readability:** Seluruh elemen HUD (uang, utang $2000, bintang wanted, health, speed, objektif + timer, minimap, dan panah GPS)[span_26](start_span)[span_26](end_span) terbaca jelas dan tidak saling bertumpuk.

Cara Memakainya di Muse AI:
 * Simpan teks di atas sebagai UPGRADE_SPEC.md di root folder repositori gta6-01.
 * Berikan perintah singkat ini ke Muse AI:
   > "Baca UPGRADE_SPEC.md secara menyeluruh. Inspeksi struktur kode gta6-01 yang ada sekarang, lalu kerjakan Fase 1 sampai Fase 4 secara berurutan dengan kode 100% orisinal. Setelah selesai, jalankan tes simulasi untuk memastikan Misi 1–6 berjalan lancar tanpa error dan siap untuk sealed recording."
   >
 * Setelah Muse AI selesai memodifikasi kode dan lolos tes lokal, lakukan satu kali playthrough bersih saat menjalankan proses sealed recording baru (tunjukkan kota 2.5D, curi mobil, ganti radio, kejar-kejaran polisi, dan selesaikan misi) sebelum mengirim entri final sebelum 24 Nov 2026 22:00 WIB.
