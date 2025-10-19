// /api/ai.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, pet } = req.body || {};
  if (!text) return res.status(400).json({ error: "Missing input" });

  // Map your pet ids to a short blurb (used only to color the *tone*, not the person)
  const PET = (pet || "nova").toLowerCase();
  const PET_BLURB =
    {
      nova: "Nova is a cat: witty and calm.",
      lumi: "Lumi is a dog: loyal and uplifting.",
      bub:  "Bub is a bear: cheerful and gentle.",
      cat:  "The pet is a cat: witty and calm.",
      dog:  "The pet is a dog: loyal and uplifting.",
      bear: "The pet is a bear: cheerful and gentle.",
    }[PET] || "The pet is a virtual companion.";

  const SYSTEM_PROMPT = `
You are MentaPet, a warm mental-wellbeing assistant.

ROLES (IMPORTANT):
- The SPEAKER is the HUMAN USER. Address them as “you”. Do NOT guess their name.
- The PET is a virtual character the user chose. ${PET_BLURB}
- Refer to the pet only in THIRD PERSON (“your pet”, “Lumi the dog”), never as the user.
- Never address the human by the pet’s name. Do not write “I’m sorry to hear that, Lumi.”

STYLE:
- Write for a phone screen: 2–4 short paragraphs max; plain words.
- Be supportive, non-clinical, non-judgmental. No diagnoses. No guarantees.
- Offer up to 2 “tiny step” suggestions when helpful (short, gentle).

WHAT TO OUTPUT IN THIS TURN:
- A single, empathetic reply to the user (no JSON, no system explanations).
`;

  try {
    // ---------- 1) Stream the friendly reply ----------
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ];

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.9,
      max_tokens: 450,
      stream: true,
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    let fullReply = "";

    for await (const chunk of stream) {
      const piece = chunk?.choices?.[0]?.delta?.content || "";
      if (piece) {
        fullReply += piece;
        // Stream incremental content chunks
        res.write(`data: ${JSON.stringify({ content: piece })}\n\n`);
      }
    }

    // ---------- 2) Classify mood/risk/actions, then emit meta ----------
    try {
      const clsSystem = `
You are a classifier for a mental-wellbeing chat. 
Return **only** compact JSON: {"mood":"happy|calm|sad|stressed","risk":true|false,"actions":["...","..."]}
- mood is your best guess based on the user's message and assistant reply.
- risk is true if there is suicidal ideation, self-harm intent, or immediate danger.
- actions are up to 3 tiny, gentle suggestions (max 4 words each), chosen from simple things like:
  "Breathe 60s","Affirmation","Text a friend","Drink water","Go outside","Stretch 30s".
No extra text.
      `.trim();

      const cls = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: clsSystem },
          {
            role: "user",
            content: `User message: """${text}"""\nAssistant reply: """${fullReply}"""\nReturn JSON only.`,
          },
        ],
      });

      // Try to parse; if it fails, fall back gracefully
      const metaRaw = cls.choices?.[0]?.message?.content?.trim() || "{}";
      let meta = {};
      try { meta = JSON.parse(metaRaw); } catch { meta = {}; }

      // Ensure safe defaults
      const outMeta = {
        mood:
          typeof meta.mood === "string" &&
          ["happy", "calm", "sad", "stressed"].includes(meta.mood)
            ? meta.mood
            : "calm",
        risk: Boolean(meta.risk),
        actions: Array.isArray(meta.actions)
          ? meta.actions.slice(0, 3)
          : ["Breathe 60s", "Affirmation"],
      };

      res.write(`data: ${JSON.stringify(outMeta)}\n\n`);
    } catch (e) {
      // Fallback meta if classification fails
      res.write(
        `data: ${JSON.stringify({
          mood: "calm",
          risk: false,
          actions: ["Breathe 60s", "Affirmation"],
        })}\n\n`
      );
    }

    res.end();
  } catch (err) {
    console.error(err);
    // Return plain JSON error (non-stream fallback)
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "AI request failed", source: "handler", detail: String(err) });
    } else {
      try { res.end(); } catch {}
    }
  }
}
