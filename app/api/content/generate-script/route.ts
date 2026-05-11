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

  const prompt = `You are a creative scriptwriter for social media videos.
Write a script with 4 segments for a storytelling video.

Product/service: ${productName} (${service})
Target audience: ${targetAudience}
Problem being solved: ${problem}
Call to action: ${cta}

Write in the same language as the product name and target audience above. Match the language naturally.

Write a JSON array with exactly 4 segments. Each segment has:
- "text": voiceover text (1-3 sentences, max 20 words per segment)
- "imagePrompt": DALL-E image prompt in English, descriptive and cinematic

Structure:
1. Hook — opening scene that hits the problem
2. Problem — shows the situation the audience recognises
3. Solution — introduces the product/service naturally
4. CTA — closing with a call to action

Reply ONLY with a clean JSON array, no explanation, no markdown:
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
