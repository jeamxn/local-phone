/**
 * Builds the GoogleGenAI client in Vertex AI mode using service-account
 * credentials supplied via environment variables (no API key — the user's GCP
 * org policy forbids AI Studio keys).
 *
 * Multi-line PEM private keys get mangled by some PaaS .env parsers, so we also
 * accept a one-line base64 form (VERTEX_PRIVATE_KEY_B64) which takes precedence.
 */
import { GoogleGenAI } from "@google/genai";

function loadPrivateKey(): string {
  const b64 = process.env.VERTEX_PRIVATE_KEY_B64?.trim();
  if (b64) {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const raw = process.env.VERTEX_PRIVATE_KEY ?? "";
  // Tolerate \n-escaped single-line form.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export interface VertexConfig {
  project: string;
  location: string;
  model: string;
}

export function getVertexConfig(): VertexConfig {
  // The Live API (gemini-*-live-*) is served from regional endpoints, NOT the
  // `global` endpoint. TTS/Lyria/image work on global, but a live-translate
  // session opened against `global` fails with "Publisher Model ... was not
  // found" and reconnect-loops. Default to a regional endpoint and only honor
  // VERTEX_LOCATION when it's an actual region (not "global").
  const envLoc = process.env.VERTEX_LOCATION?.trim();
  const location =
    envLoc && envLoc.toLowerCase() !== "global" ? envLoc : "us-central1";
  return {
    project: process.env.VERTEX_PROJECT_ID ?? "",
    location,
    model:
      process.env.GEMINI_TRANSLATE_MODEL ||
      // The dedicated gemini-*-live-translate-preview models are AI Studio
      // (ai.google.dev) only — NOT in Vertex's Live API model list and probed
      // "Publisher Model not found" across all regions. On Vertex the live
      // models are the native-audio family; use the GA-stable id (the
      // ...-preview-...-09-2025 variant is flagged deprecated by Vertex docs).
      "gemini-live-2.5-flash-native-audio",
  };
}

let cached: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (cached) return cached;

  const cfg = getVertexConfig();
  const privateKey = loadPrivateKey();
  const clientEmail = process.env.VERTEX_CLIENT_EMAIL ?? "";

  if (!cfg.project || !clientEmail || !privateKey) {
    throw new Error(
      "Vertex SA credentials missing (need VERTEX_PROJECT_ID, VERTEX_CLIENT_EMAIL, VERTEX_PRIVATE_KEY[_B64])",
    );
  }

  cached = new GoogleGenAI({
    vertexai: true,
    project: cfg.project,
    location: cfg.location,
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
        // optional, harmless when present
        client_id: process.env.VERTEX_CLIENT_ID,
        private_key_id: process.env.VERTEX_PRIVATE_KEY_ID,
        type: "service_account",
      } as Record<string, string>,
      projectId: cfg.project,
    },
  });
  return cached;
}

/** Whether Vertex credentials are configured. Used to degrade gracefully. */
export function vertexConfigured(): boolean {
  const pk = process.env.VERTEX_PRIVATE_KEY_B64 || process.env.VERTEX_PRIVATE_KEY;
  return !!(process.env.VERTEX_PROJECT_ID && process.env.VERTEX_CLIENT_EMAIL && pk);
}
