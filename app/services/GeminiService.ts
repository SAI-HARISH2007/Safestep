import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

export interface SafetyAnalysis {
  score: number;
  tip: string;
  isMock: boolean;
}

export async function getSafetyAnalysis(origin: string, destination: string, mode: string = 'walking'): Promise<SafetyAnalysis> {
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("Gemini API Key is missing or invalid. Using simulation fallback.");
    // Simulation fallback
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          score: Math.floor(Math.random() * 3) + 7,
          tip: `Simulation: ${mode.charAt(0).toUpperCase() + mode.slice(1)} route from ${origin} to ${destination} is well-lit.`,
          isMock: true
        });
      }, 1500);
    });
  }

  try {
    // User requested "gemini-3-flash" (2026 Model) with JSON Mode
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash",
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction: "You are an expert urban safety analyst. Analyze the route between the two points provided. Return ONLY JSON."
    });

    const prompt = `Analyze the route from ${origin} to ${destination}. The user is ${mode === 'driving' ? 'driving' : mode === 'cycling' ? 'cycling' : 'walking'}. Provide a safety score (1-10) and a tip. IMPORTANT: If the destination is a major city center, score it higher. If it's an unmapped or rural area, score it lower. Never return 8 by default. Your response MUST be unique to these coordinates. Provide a JSON response: { "score": number, "tip": "string" }`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log("Gemini Response:", responseText);

    if (!responseText) throw new Error("Empty response from Gemini");

    return { ...JSON.parse(responseText), isMock: false } as SafetyAnalysis;

  } catch (error) {
    console.error("Gemini API Error (Falling back to offline mode):", error);
    // Specific Fallback as requested
    return {
      score: 8,
      tip: "Analysis based on local historical data: This route is well-lit and active.",
      isMock: true
    };
  }
}
