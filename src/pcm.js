'use strict';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;

function pcmDurationMs(buffer) {
  return (buffer.length / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)) * 1000;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function pcmStereoToMonoWav(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('PCM audio must be a Buffer.');

  const frameBytes = CHANNELS * BYTES_PER_SAMPLE;
  const frameCount = Math.floor(buffer.length / frameBytes);
  const dataSize = frameCount * BYTES_PER_SAMPLE;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  wav.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  wav.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const inputOffset = frame * frameBytes;
    const left = buffer.readInt16LE(inputOffset);
    const right = buffer.readInt16LE(inputOffset + BYTES_PER_SAMPLE);
    wav.writeInt16LE(Math.trunc((left + right) / 2), 44 + frame * BYTES_PER_SAMPLE);
  }

  return wav;
}

module.exports = {
  BYTES_PER_SAMPLE,
  CHANNELS,
  SAMPLE_RATE,
  clampInt,
  pcmStereoToMonoWav,
  pcmDurationMs,
};
