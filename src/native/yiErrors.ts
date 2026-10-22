/** Maps error codes from the native Yi control module to Indonesian messages for the user. */
const MESSAGES: Record<string, string> = {
  NO_WIFI:
    'Ponsel tidak terhubung ke Wi-Fi. Sambungkan ke jaringan Wi-Fi kamera Yi (namanya mirip YDXJ_...).',
  TIMEOUT:
    'Kamera tidak menjawab tepat waktu. Pastikan kamera menyala dan ponsel terhubung ke Wi-Fi kamera Yi.',
  CONNECTION_FAILED:
    'Tidak dapat terhubung ke kamera. Periksa alamat kamera dan koneksi Wi-Fi.',
  CLOSED: 'Kamera menutup koneksi sebelum aktivasi selesai.',
  BAD_REPLY:
    'Jawaban kamera tidak dikenali. Firmware kamera mungkin berbeda dari yang diperkirakan.',
  REJECTED: 'Kamera menolak perintah aktivasi.',
  MODULE_UNAVAILABLE: 'Modul kontrol kamera tidak tersedia di build ini.',
};

const FALLBACK = 'Terjadi kesalahan yang tidak dikenal saat menghubungi kamera.';

export function describeYiError(code: string | undefined): string {
  if (code !== undefined && Object.prototype.hasOwnProperty.call(MESSAGES, code)) {
    return MESSAGES[code];
  }
  return FALLBACK;
}

/** React Native rejects native promises with an Error that has a string `code`. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
}