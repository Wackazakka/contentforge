import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface Segment {
  text: string;
  imagePrompt: string;
}

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
}

export async function POST(req: NextRequest) {
  const { targetAudience, problem, productName, service, cta } =
    (await req.json()) as {
      targetAudience?: string;
      problem?: string;
      productName?: string;
      service?: string;
      cta?: string;
    };

  if (!targetAudience || !problem || !productName || !service || !cta) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const prompt = `Du er en kreativ manusforfatter for sosiale medier-videoer.
Lag et manuskript med 4 segmenter for en storytelling-video på norsk.

Produkt/tjeneste: ${productName} (${service})
Målgruppe: ${targetAudience}
Problem som løses: ${problem}
Call to action: ${cta}

Skriv et JSON-array med nøyaktig 4 segmenter. Hvert segment har:
- "text": voiceover-tekst på norsk (1-3 setninger, maks 20 ord per segment)
- "imagePrompt": DALL-E bildeprompt på engelsk, beskrivende og filmisk

Struktur:
1. Hook — åpningsscene som treffer problemet
2. Problem — viser situasjonen målgruppen kjenner seg igjen i
3. Løsning — introduserer produktet/tjenesten naturlig
4. CTA — avslutning med oppfordring til handling

Svar KUN med et rent JSON-array, ingen forklaring, ingen markdown:
[{"text":"...","imagePrompt":"..."},...]`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    console.error("[generate-script] Anthropic error:", err);
    return Response.json(
      { error: "Failed to generate script" },
      { status: 502 }
    );
  }

  const data = (await anthropicRes.json()) as AnthropicMessage;
  const raw = data.content?.[0]?.text ?? "";

  let segments: Segment[];
  try {
    segments = JSON.parse(raw);
    if (!Array.isArray(segments)) throw new Error("Not an array");
  } catch {
    console.error("[generate-script] Parse error, raw:", raw);
    return Response.json(
      { error: "Failed to parse generated script" },
      { status: 502 }
    );
  }

  return Response.json({ segments });
}
