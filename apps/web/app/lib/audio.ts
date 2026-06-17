// Browser audio helpers for the translation pipeline.
//   uplink:   mic MediaStream -> 16 kHz mono PCM16 base64 frames
//   downlink: 24 kHz mono PCM16 base64 -> queued playback

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    let s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const next = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = Math.floor(i * ratio); j < next && j < input.length; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count ? sum / count : 0;
    pos = next;
  }
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Captures a mic MediaStream and emits base64 PCM16 @ 16 kHz mono frames.
 * Returns a stop() function.
 */
export function createMicCapturer(
  stream: MediaStream,
  onFrame: (pcmBase64: string) => void,
): () => void {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally supported and simplest here.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(ctx.destination);

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const down = downsample(input, ctx.sampleRate, 16000);
    const pcm = floatTo16BitPCM(down);
    onFrame(arrayBufferToBase64(pcm));
  };

  return () => {
    try {
      processor.disconnect();
      source.disconnect();
      void ctx.close();
    } catch {
      /* ignore */
    }
  };
}

/**
 * Plays a stream of base64 PCM16 @ 24 kHz mono frames, scheduling them
 * back-to-back so translated speech sounds continuous. One player per speaker.
 */
export class PcmPlayer {
  private ctx: AudioContext;
  private nextTime = 0;
  private gain: GainNode;
  private readonly rate = 24000;

  constructor() {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.gain.gain.value = v;
  }

  push(pcmBase64: string): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const buf = base64ToArrayBuffer(pcmBase64);
    const view = new DataView(buf);
    const samples = buf.byteLength / 2;
    const audioBuf = this.ctx.createBuffer(1, samples, this.rate);
    const ch = audioBuf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      ch[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.05;
    src.start(this.nextTime);
    this.nextTime += audioBuf.duration;
  }

  close(): void {
    try {
      void this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
