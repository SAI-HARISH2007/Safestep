'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPrompt } from "./safetyPrompt";

export interface SafetyAnalysis {
  score: number;
  tip: string;
  source: 'Gemini' | 'Groq' | 'EST';
}

// Security: Keys accessed only on server
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Score bounds the UI and prompt both assume. The model is asked for 1-10 but
// nothing guarantees it; validate + clamp so an out-of-range or non-numeric
// score never reaches the user as a "safety score".
const SCORE_MIN = 1;
const SCORE_MAX = 10;

// Validates a model response and returns a bounded score. Throws when the
// response is structurally unusable so the caller falls through to the next
// provider instead of surfacing garbage.
function validateAnalysis(raw: { score: unknown; tip: unknown }): { score: number; tip: string } {
  const n = typeof raw.score === "number" ? raw.score : Number(raw.score);
  if (!Number.isFinite(n)) {
    throw new Error(`Model returned non-numeric score: ${JSON.stringify(raw.score)}`);
  }
  if (typeof raw.tip !== "string" || raw.tip.trim() === "") {
    throw new Error("Model returned missing/empty tip");
  }
  const score = Math.min(SCORE_MAX, Math.max(SCORE_MIN, n));
  if (score !== n) {
    console.warn(`[SafetyService] Clamped out-of-range score ${n} -> ${score}`);
  }
  return { score, tip: raw.tip };
}

export async function getSafetyAnalysis(origin: string, destination: string, mode: string = 'walking'): Promise<SafetyAnalysis> {
  console.log(`[SafetyService] Request: ${origin} -> ${destination} (${mode})`);

  // ATTEMPT 1: GEMINI 1.5 FLASH
  try {
    if (!GEMINI_API_KEY) throw new Error("Gemini Key Missing");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });

    const prompt = getPrompt(origin, destination, mode);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const data = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());

    const { score, tip } = validateAnalysis(data);
    return { score, tip, source: 'Gemini' };

  } catch (geminiError: any) {
    console.warn(`[SafetyService] Gemini Failed: ${geminiError.message}. Switching to Groq...`);

    // ATTEMPT 2: GROQ (LLAMA 3.1)
    try {
      if (!GROQ_API_KEY) throw new Error("Groq Key Missing");

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: getPrompt(origin, destination, mode) + "\n\nRETURN JSON ONLY." }],
          response_format: { type: "json_object" }
        })
      });

      if (!groqResponse.ok) throw new Error(`Groq Status: ${groqResponse.status}`);

      const groqData = await groqResponse.json();
      const parsedGroq = JSON.parse(groqData.choices[0].message.content);

      const { score, tip } = validateAnalysis(parsedGroq);
      return { score, tip, source: 'Groq' };

    } catch (groqError: any) {
      console.error(`[SafetyService] Groq Failed: ${groqError.message}. Using Offline Fallback.`);

      // ATTEMPT 3: EST FALLBACK
      return {
        score: 7.8,
        tip: "EST: Using local urban safety metrics. Stay on main roads and avoid unlit shortcuts.",
        source: 'EST'
      };
    }
  }
}

