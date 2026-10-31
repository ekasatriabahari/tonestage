/** Keeps the most recent latency readings (milliseconds). Invalid readings are ignored. */
export function pushLatency(history: number[], value: number, max: number = 20): number[] {
  if (!Number.isFinite(value) || value < 0) {
    return history;
  }
  const next = history.concat(value);
  return next.length > max ? next.slice(next.length - max) : next;
}

export function averageLatency(history: number[]): number | null {
  if (history.length === 0) {
    return null;
  }
  return history.reduce((sum, v) => sum + v, 0) / history.length;
}

export type Note = { level: 'info' | 'warn'; text: string };

/**
 * Notes about monitoring. The latency shown is an ESTIMATE for the backing track going out of the
 * phone; it is not the delay of the guitar, and zero delay is never promised.
 */
export function monitoringNotes(
  averageMs: number | null,
  routedType: string | null,
  routedIsUsb: boolean,
): Note[] {
  const notes: Note[] = [];
  if (averageMs !== null) {
    notes.push({
      level: averageMs > 100 ? 'warn' : 'info',
      text:
        averageMs > 100
          ? `Jeda keluaran sekitar ${Math.round(averageMs)} ms (perkiraan, termasuk buffer pemutar). Itu tinggi: tidak cocok untuk memantau gitar lewat ponsel.`
          : `Jeda keluaran sekitar ${Math.round(averageMs)} ms (perkiraan, termasuk buffer pemutar). Ini jeda backing track dari ponsel, bukan jeda gitar.`,
    });
  }
  if (routedType === 'BLUETOOTH_A2DP' || routedType === 'BLUETOOTH_SCO') {
    notes.push({
      level: 'warn',
      text: 'Output Bluetooth biasanya punya jeda besar dan tidak cocok untuk memantau gitar secara langsung.',
    });
  }
  if (routedIsUsb) {
    notes.push({
      level: 'info',
      text: 'Pantau gitar langsung lewat SPM bila memungkinkan: gitar tidak melewati ponsel, jadi jedanya ditentukan SPM, bukan aplikasi. Belum diverifikasi bahwa SPM mencampur backing track dan gitar di headphone-nya; ujilah dengan memainkan gitar saat backing track berputar.',
    });
  }
  notes.push({
    level: 'info',
    text: 'Aplikasi tidak menjanjikan nol jeda. Rekaman gitar bersih diambil dari input sumber dan tidak terpengaruh volume, mute, atau EQ di mixer.',
  });
  return notes;
}

export type IoStatus = { level: 'ok' | 'info'; text: string };

/** What is actually happening with the USB device as input and output at the same time. */
export function describeSimultaneousIo(args: {
  inputRunning: boolean;
  inputIsUsb: boolean;
  outputPlaying: boolean;
  routedName: string | null;
  routedIsUsb: boolean;
}): IoStatus {
  const { inputRunning, inputIsUsb, outputPlaying, routedName, routedIsUsb } = args;
  if (!inputRunning || !outputPlaying) {
    return {
      level: 'info',
      text: 'Untuk menguji input dan output bersamaan: mulai meter gitar, lalu putar backing track ke SPM.',
    };
  }
  if (inputIsUsb && routedIsUsb) {
    return {
      level: 'ok',
      text: 'Input USB dan output USB aktif bersamaan saat ini. Belum ada masalah yang terdeteksi, tapi ini belum menjamin kestabilan pada rekaman panjang.',
    };
  }
  return {
    level: 'info',
    text: `Input aktif; output terarah ke ${routedName ?? 'perangkat lain'}${routedIsUsb ? '' : ' (bukan USB)'}.`,
  };
}