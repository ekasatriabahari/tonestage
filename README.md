# ToneStage

**ToneStage** adalah aplikasi Android untuk membantu gitaris merekam permainan gitar dengan kombinasi video wireless dan audio dari audio interface.

Aplikasi ini dikembangkan menggunakan **React Native CLI** dan dirancang sebagai studio recording portable dengan konsep sederhana:

> **Camera + Guitar Audio + Backing Track → Recording**

## 🎸 Fitur Utama

### 📷 Wireless Camera

ToneStage dapat menggunakan kamera wireless sebagai sumber video.

Saat ini pengembangan difokuskan pada:

- **YI Action Cam Gen 1 Basic**
- Live video melalui **RTSP**
- Live preview langsung di aplikasi
- Perekaman video ke penyimpanan lokal

Arsitektur aplikasi dirancang agar di masa depan dapat mendukung sumber kamera wireless lainnya.

### 🎵 Guitar Audio Recording

Input gitar menggunakan:

- **Sonicake Pocket Master (SPM)**
- Terhubung langsung ke Android melalui USB
- Digunakan sebagai USB audio interface
- Audio direkam secara terpisah untuk menjaga kualitas sinyal gitar

### 🎧 Backing Track

Pengguna dapat memuat backing track secara terpisah dari perangkat.

Konsep audio ToneStage:

```text
Guitar ──> Sonicake Pocket Master ──> Android
                                            │
Backing Track ──────────────────────────────┤
                                            │
                                     Mixer / Processing
                                            │
                                            ▼
                                      Final Recording
```

Pemisahan audio gitar dan backing track memungkinkan proses mixing dan pengolahan audio dilakukan dengan lebih fleksibel.

### 🎚 Audio Processing

ToneStage sedang dikembangkan untuk mendukung pengolahan audio sebelum proses final mixing.

Rencana fitur:

- Frequency cut
- High-pass filter
- Parametric EQ
- Pengaturan frekuensi gitar agar tidak bertabrakan dengan backing track
- Mixer volume gitar dan backing track

### 🎬 Audio & Video Synchronization

Video dan audio direkam melalui sumber yang berbeda:

```text
YI Action Cam
     │
    RTSP
     │
     ▼
  ToneStage
     │
     ├── Video Recording
     │
SPM ─┤
     │
     ├── Guitar Audio Recording
     │
Backing Track
     │
     ▼
 Audio Processing & Mixing
     │
     ▼
 Final Video Export
```

Sinkronisasi audio dan video menjadi salah satu fokus utama pengembangan ToneStage.

### 🖼 Picture-in-Picture

Direncanakan dukungan Android Picture-in-Picture (PiP).

Ketika aplikasi diminimalkan:

- Hanya live preview kamera yang ditampilkan.
- UI mixer dan kontrol aplikasi disembunyikan.
- Koneksi RTSP diusahakan tetap aktif.
- Sesi recording tidak boleh terganggu.

---

## 📱 Technology Stack

| Technology | Usage |
|---|---|
| React Native CLI | Android application |
| JavaScript | Main application language |
| Android Native | Camera, audio, PiP, dan native integration |
| RTSP | Wireless camera streaming |
| Sonicake Pocket Master | USB guitar audio input |

## 🛠 Development Setup

### Requirements

Pastikan environment React Native Android sudah tersedia:

- Node.js `>= 22.11.0`
- Android Studio
- Android SDK
- Java Development Kit (JDK)
- Android device atau emulator

### Installation

Clone repository:

```bash
git clone <repository-url>
cd tonestage
```

Install dependency:

```bash
npm install
```

Atau, jika project memiliki `package-lock.json` yang sesuai:

```bash
npm ci
```

### Run Metro

```bash
npx react-native start
```

Jika mengalami masalah cache:

```bash
npx react-native start --reset-cache
```

### Run Android

Buka terminal baru:

```bash
npx react-native run-android
```

### Clean Android Build

Jika diperlukan:

```bash
cd android
gradlew.bat clean
cd ..
```

---

## 📂 Project Status

### Completed / Working

- [x] React Native Android project setup
- [x] RTSP streaming test
- [x] Live video preview
- [x] Keep Awake
- [x] Video recording
- [x] Save recorded video to local storage
- [x] SPM audio recording test
- [x] WAV output verification

### In Development

- [ ] Audio frequency cut / EQ
- [ ] Local backing track loading
- [ ] Guitar and backing track mixing
- [ ] Audio-video synchronization
- [ ] Final MP4 export
- [ ] Picture-in-Picture live preview
- [ ] Studio / mixer UI redesign
- [ ] User guide screen

### Future Plans

- Support additional wireless cameras
- Support other action cameras
- Camera source selection
- Audio input selection
- Monitoring output selection
- Advanced EQ presets
- Guitar recording presets
- Improved audio-video synchronization controls

---

## 🎯 Project Goal

ToneStage is designed to make guitar recording more practical using a mobile device.

The goal is to allow a workflow like this:

```text
┌──────────────────┐
│ Wireless Camera  │
│   YI / Future    │
└────────┬─────────┘
         │ RTSP
         ▼
┌─────────────────────────────────┐
│            ToneStage            │
│                                 │
│  Camera Preview                 │
│  Guitar Recording               │
│  Backing Track                  │
│  Mixer                          │
│  EQ / Frequency Cut             │
│                                 │
└───────────────┬─────────────────┘
                │
                ▼
         Final Video Export
```

---

## ⚠️ Important Notes

ToneStage is currently under active development.

Some features described in this README are planned and may not yet be available in the current build.

The application prioritizes:

1. Recording stability
2. Audio quality
3. Audio-video synchronization
4. Reliable wireless camera streaming

New features should not compromise existing recording functionality.

---

## 📄 License

License will be determined in a future release.

---

**ToneStage**  
*Record. Play. Perform.*