// Shared, framework-agnostic prompt builder for the route-safety scoring feature.
// Extracted from GeminiService so it can be imported by both the production
// server action and the standalone adversarial eval harness in evals/,
// guaranteeing the eval exercises the EXACT production prompt.
//
// NOTE: This module is intentionally plain (no 'use server'). A 'use server'
// module may only export async functions, so the synchronous getPrompt() cannot
// live in GeminiService.ts alongside the server action.

export function getPrompt(origin: string, destination: string, mode: string): string {
  const time = new Date().toLocaleTimeString();
  return `
      ROLE: You are a "Hyper-Critical Urban Safety Auditor."
      CONTEXT: Current time is ${time}. Mode: ${mode}.
      TASK: Analyze the route from ${origin} to ${destination}.

      CRITICAL SCORING RULES:
      - STRICTLY FORBIDDEN to default to 7 or 8. Use the full 1-10 scale.
      - 9-10: Bustling, high-visibility main streets only.
      - 1-4: Unlit parks, isolated alleys, or desolate areas, especially at night.
      - 6-8: Average residential areas.
      - Be EXTREMELY critical based on the time of day (${time}).

      OUTPUT REQUIREMENTS:
      - Tip: 2-3 detailed sentences explaining the score (e.g., "Lighting is poor," "High crowd density").
      - JSON format: { "score": number, "tip": "string" }
  `;
}
