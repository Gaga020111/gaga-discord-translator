'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clampInt, pcmDurationMs, pcmStereoToMonoWav } = require('../src/pcm');

test('pcmDurationMs understands Discord 48 kHz stereo s16 PCM', () => {
  const oneSecond = Buffer.alloc(48_000 * 2 * 2);
  assert.equal(pcmDurationMs(oneSecond), 1_000);
});

test('clampInt applies fallback and bounds', () => {
  assert.equal(clampInt(undefined, 900, 300, 5_000), 900);
  assert.equal(clampInt('10', 900, 300, 5_000), 300);
  assert.equal(clampInt('99999', 900, 300, 5_000), 5_000);
  assert.equal(clampInt('1200', 900, 300, 5_000), 1_200);
});

test('pcmStereoToMonoWav creates a valid 48 kHz mono WAV', () => {
  const stereo = Buffer.alloc(8);
  stereo.writeInt16LE(1_000, 0);
  stereo.writeInt16LE(3_000, 2);
  stereo.writeInt16LE(-2_000, 4);
  stereo.writeInt16LE(1_000, 6);

  const wav = pcmStereoToMonoWav(stereo);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 48_000);
  assert.equal(wav.readUInt32LE(40), 4);
  assert.equal(wav.readInt16LE(44), 2_000);
  assert.equal(wav.readInt16LE(46), -500);
});
