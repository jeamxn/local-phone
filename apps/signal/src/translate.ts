/**
 * Translation hub.
 *
 * For each (speaker, targetLanguage) pair active in a room, we open one
 * Gemini Live "translate" session. The speaker's mic PCM (16 kHz mono) is
 * streamed in; the model returns translated AUDIO (24 kHz mono) which we route
 * to every listener whose chosen language == targetLanguage.
 *
 * Sessions are lazily created on first audio frame and torn down when idle.
 */
import { Modality, type Session } from "@google/genai";
import { getGenAI, getVertexConfig, vertexConfigured } from "./vertex.js";

const IDLE_MS = 60_000; // close a session after 60s of no audio

interface TransSession {
  session: Session | null;
  connecting: Promise<void> | null;
  lastUsed: number;
  targetLang: string;
  speakerId: string;
}

type AudioOut = (speakerId: string, targetLang: string, pcmBase64: string) => void;
type TextOut = (speakerId: string, targetLang: string, text: string) => void;

export class TranslationHub {
  private sessions = new Map<string, TransSession>(); // key: `${speakerId}:${targetLang}`
  private sweepTimer: NodeJS.Timeout;

  constructor(
    private onAudio: AudioOut,
    private onText: TextOut,
  ) {
    this.sweepTimer = setInterval(() => this.sweepIdle(), 15_000);
    this.sweepTimer.unref?.();
  }

  get enabled(): boolean {
    return vertexConfigured();
  }

  private key(speakerId: string, targetLang: string): string {
    return `${speakerId}:${targetLang}`;
  }

  /** Push a mic PCM frame (base64, 16 kHz mono PCM16) for translation into targetLangs. */
  async pushAudio(
    speakerId: string,
    targetLangs: string[],
    speakerLang: string,
    pcmBase64: string,
  ): Promise<void> {
    if (!this.enabled) return;
    for (const lang of targetLangs) {
      if (lang === speakerLang) continue; // no self-translation
      const ts = await this.ensure(speakerId, lang);
      if (!ts?.session) continue;
      ts.lastUsed = Date.now();
      try {
        ts.session.sendRealtimeInput({
          audio: { data: pcmBase64, mimeType: "audio/pcm;rate=16000" },
        });
      } catch (e) {
        console.error(`[trans] send failed ${this.key(speakerId, lang)}:`, e);
        this.close(speakerId, lang);
      }
    }
  }

  private async ensure(speakerId: string, targetLang: string): Promise<TransSession | undefined> {
    const k = this.key(speakerId, targetLang);
    let ts = this.sessions.get(k);
    if (ts) {
      if (ts.connecting) await ts.connecting;
      return ts;
    }

    ts = { session: null, connecting: null, lastUsed: Date.now(), targetLang, speakerId };
    this.sessions.set(k, ts);

    const cfg = getVertexConfig();
    const ai = getGenAI();

    ts.connecting = (async () => {
      try {
        ts!.session = await ai.live.connect({
          model: cfg.model,
          config: {
            responseModalities: [Modality.AUDIO],
            // realtime translation directive
            translationConfig: { targetLanguageCode: targetLang },
            contextWindowCompression: {
              triggerTokens: "0",
              slidingWindow: { targetTokens: "0" },
            },
          } as Record<string, unknown>,
          callbacks: {
            onopen: () => console.log(`[trans] open ${k}`),
            onmessage: (message: unknown) => this.handleMessage(speakerId, targetLang, message),
            onerror: (e: { message?: string }) =>
              console.error(`[trans] error ${k}:`, e?.message),
            onclose: (e: { reason?: string }) => {
              console.log(`[trans] close ${k}: ${e?.reason ?? ""}`);
              this.sessions.delete(k);
            },
          },
        });
      } catch (e) {
        console.error(`[trans] connect failed ${k}:`, e);
        this.sessions.delete(k);
      } finally {
        if (ts) ts.connecting = null;
      }
    })();

    await ts.connecting;
    return this.sessions.get(k);
  }

  private handleMessage(speakerId: string, targetLang: string, message: unknown): void {
    const m = message as {
      serverContent?: {
        modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> };
      };
      data?: string;
    };

    // Some SDK versions surface audio as top-level `data`.
    if (typeof m.data === "string" && m.data.length > 0) {
      this.onAudio(speakerId, targetLang, m.data);
    }

    const parts = m.serverContent?.modelTurn?.parts;
    if (!parts) return;
    for (const part of parts) {
      if (part.inlineData?.data) {
        this.onAudio(speakerId, targetLang, part.inlineData.data);
      }
      if (part.text) {
        this.onText(speakerId, targetLang, part.text);
      }
    }
  }

  private close(speakerId: string, targetLang: string): void {
    const k = this.key(speakerId, targetLang);
    const ts = this.sessions.get(k);
    if (ts?.session) {
      try {
        ts.session.close();
      } catch {
        /* ignore */
      }
    }
    this.sessions.delete(k);
  }

  /** Close all sessions for a speaker (e.g. they left the room). */
  closeSpeaker(speakerId: string): void {
    for (const k of [...this.sessions.keys()]) {
      if (k.startsWith(`${speakerId}:`)) {
        const ts = this.sessions.get(k);
        try {
          ts?.session?.close();
        } catch {
          /* ignore */
        }
        this.sessions.delete(k);
      }
    }
  }

  private sweepIdle(): void {
    const now = Date.now();
    for (const [k, ts] of this.sessions) {
      if (now - ts.lastUsed > IDLE_MS) {
        try {
          ts.session?.close();
        } catch {
          /* ignore */
        }
        this.sessions.delete(k);
      }
    }
  }
}
