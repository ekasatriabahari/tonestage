/* eslint-env node */
/**
 * ToneStage tool: probe the Xiaomi Yi Action Camera Gen 1 control port from a PC.
 *
 * Run it on a computer connected to the camera's Wi-Fi (SSID like YDXJ_xxxxxxx):
 *   node scripts/yi-probe.js            (uses 192.168.42.1:7878)
 *   node scripts/yi-probe.js <host> [port]
 *
 * It sends the two commands described by community documentation:
 *   1. {"msg_id":257,"token":0,"param":0}                          -> camera replies with a token
 *   2. {"msg_id":259,"token":<token>,"param":"none_force"}         -> asks the camera to start the live view
 * and prints EVERY message the camera sends back, unchanged, so we learn what your
 * firmware really does. The connection stays open until you press Ctrl+C
 * (some firmware may stop the stream when the control connection closes).
 * Afterwards open rtsp://<host>/live in VLC to see whether the stream works.
 */
const net = require('net');

const host = process.argv[2] || '192.168.42.1';
const port = Number(process.argv[3] || 7878);

const socket = net.createConnection({ host, port });
socket.setEncoding('utf8');
socket.setTimeout(8000);

let buffer = '';
let startSent = false;

function log(label, text) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${label} ${text}`);
}

function send(object) {
  const text = JSON.stringify(object);
  log('->', text);
  socket.write(text);
}

/** The camera sends JSON objects without a delimiter, so split by brace depth. */
function extractMessages() {
  const messages = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  let consumed = 0;
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        messages.push(buffer.slice(start, i + 1));
        consumed = i + 1;
        start = -1;
      }
    }
  }
  buffer = buffer.slice(consumed);
  return messages;
}

function handle(text) {
  log('<-', text);
  let message;
  try {
    message = JSON.parse(text);
  } catch (e) {
    log('!!', 'not valid JSON');
    return;
  }
  if (message.msg_id === 257 && message.rval === 0 && !startSent) {
    startSent = true;
    send({ msg_id: 259, token: message.param, param: 'none_force' });
  } else if (message.msg_id === 259) {
    if (message.rval === 0) {
      log('OK', `Camera accepted the start command. Now open rtsp://${host}/live in VLC.`);
    } else {
      log('!!', `Camera answered rval=${message.rval} to the start command.`);
    }
  }
}

socket.on('connect', () => {
  log('OK', `Connected to ${host}:${port}`);
  send({ msg_id: 257, token: 0, param: 0 });
});

socket.on('data', chunk => {
  buffer += chunk;
  extractMessages().forEach(handle);
});

socket.on('timeout', () => {
  if (!startSent) {
    log('!!', 'No answer within 8 s. Are you on the camera Wi-Fi? Is the camera awake?');
    socket.destroy();
  }
});

socket.on('error', error => {
  log('!!', `Socket error: ${error.message}`);
});

socket.on('close', () => {
  log('--', 'Connection closed by the camera or by you.');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('--', 'Closing (Ctrl+C).');
  socket.destroy();
});
