'use strict';

const { pcmStereoToMonoWav } = require('./pcm');

function completionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'string' ? part : part?.text || ''))
    .join('\n')
    .trim();
}

async function apiError(response) {
  let detail = '';
  try {
    const payload = await response.json();
    detail = String(payload?.error?.message || '').slice(0, 500);
  } catch {
    // Avoid printing arbitrary HTML or secrets from an upstream error response.
  }
  return new Error(`Groq API 錯誤 (${response.status})${detail ? `：${detail}` : ''}`);
}

class GroqTranslationService {
  constructor(options = {}) {
    this.apiKey = String(options.apiKey ?? process.env.GROQ_API_KEY ?? '').trim();
    this.apiBaseUrl = String(
      options.apiBaseUrl ?? process.env.GROQ_API_BASE_URL ?? 'https://api.groq.com/openai/v1',
    ).replace(/\/$/, '');
    this.transcribeModel = String(
      options.transcribeModel ?? process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3-turbo',
    );
    this.translationModel = String(
      options.translationModel ?? process.env.GROQ_TRANSLATION_MODEL ?? 'openai/gpt-oss-20b',
    );
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.maxConcurrent = Math.max(
      1,
      Math.min(5, Number.parseInt(options.maxConcurrent ?? process.env.MAX_CONCURRENT_TRANSLATIONS ?? '2', 10) || 2),
    );
    this.active = 0;
    this.queue = [];
  }

  get ready() {
    return Boolean(this.apiKey && this.fetch);
  }

  translatePcm(pcm) {
    return new Promise((resolve, reject) => {
      this.queue.push({ pcm, resolve, reject });
      this.#drain();
    });
  }

  #drain() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.active += 1;
      this.#translate(job.pcm)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active -= 1;
          this.#drain();
        });
    }
  }

  async #translate(pcm) {
    if (!this.ready) throw new Error('尚未設定 GROQ_API_KEY。');

    const wav = pcmStereoToMonoWav(pcm);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'discord-utterance.wav');
    form.append('model', this.transcribeModel);
    form.append('language', 'en');
    form.append('prompt', 'English Discord conversation. Preserve names, numbers, game terms, and technical terms.');

    const transcriptionResponse = await this.fetch(`${this.apiBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!transcriptionResponse.ok) throw await apiError(transcriptionResponse);

    const transcription = await transcriptionResponse.json();
    const english = String(transcription?.text || '').trim();
    if (!english) return { english: '', chinese_traditional: '' };

    const translationResponse = await this.fetch(`${this.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.translationModel,
        messages: [
          {
            role: 'system',
            content: [
              'Translate the English speech into natural Traditional Chinese used in Taiwan.',
              'Preserve names, numbers, game terms, and technical terms accurately.',
              'Return only the translated text. Do not add explanations, labels, or Markdown.',
            ].join(' '),
          },
          { role: 'user', content: english },
        ],
        reasoning_effort: 'low',
        temperature: 0,
        max_completion_tokens: 400,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!translationResponse.ok) throw await apiError(translationResponse);

    const translation = completionText(await translationResponse.json());
    if (!translation) throw new Error('Groq 翻譯回應沒有文字。');
    return { english, chinese_traditional: translation };
  }
}

module.exports = { GroqTranslationService, completionText };
