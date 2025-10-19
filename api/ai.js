// /api/ai.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, pet } = req.body || {};
  if (!text) return res.status(400).json({ error: "Missing input" });

  try {
    const prompt = `
You are MentaPet — a friendly emotional support pet.
User's pet: ${pet || "cat"}
User says: "${text}"
Respond with gentle empathy and suggest a small coping action if appropriate.
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a supportive and caring mental health companion." },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 450,
    });

    const aiReply = response.choices?.[0]?.message?.content || "I'm here with you. Let's take a breath together.";
    const risk = /(suicide|kill myself|end it|die|hopeless|worthless)/i.test(text);
    const mood = risk ? "sad" : text.includes("happy") ? "happy" : text.includes("anxious") ? "stressed" : "calm";

    return res.status(200).json({
      mood,
      risk,
      reply: aiReply,
      actions: ["Breathe 60s", "Affirmation", "Talk to a friend"],
      source: "ai"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "AI request failed", source: "fallback" });
  }
}
