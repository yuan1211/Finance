import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { isResultVoiceText } from "./result-voice-request";

export const GUIDE_VOICE = "ko-KR-InJoonNeural";
const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]!));

export async function synthesizeResult(text: string): Promise<Buffer> {
  // Never send arbitrary input, call transcripts, phone numbers or freeform messages.
  if (!isResultVoiceText(text)) throw new Error("Unsupported result template");
  const tts = new MsEdgeTTS();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await tts.setMetadata(GUIDE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(escapeXml(text), { rate: 1.2, pitch: "-2Hz" });
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of audioStream) {
          size += chunk.length;
          if (size > 2_000_000) throw new Error("Audio too large");
          chunks.push(Buffer.from(chunk));
        }
        if (size < 100) throw new Error("Empty audio");
        return Buffer.concat(chunks);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error("Voice timeout")); tts.close(); }, 18_000);
      }),
    ]);
  } finally { clearTimeout(timer); tts.close(); }
}
