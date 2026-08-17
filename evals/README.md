# SafeStep — Adversarial Eval Harness

Standalone Node script that stress-tests the LLM route-safety scoring feature
(`app/services/GeminiService.ts`). It reuses the **exact production prompt** by
importing `getPrompt()` from `app/services/safetyPrompt.ts` — the same function
the production server action calls.

**Provider health first.** The harness probes the two models production pins —
Gemini `gemini-1.5-flash` and Groq `llama-3.1-8b-instant` — with real calls. As of
the 2026-08-17 run both return **404** (retired / decommissioned), meaning the live
app reaches neither provider and serves the hardcoded `7.8` fallback to every user.
Because the pinned models are dead, the four suites run against a **live substitute**
(`openai/gpt-oss-120b` via Groq, the app's own fallback provider) using the identical
production prompt, to characterize the prompt's behavior with a working model. The
substitute model is set at the top of `run-evals.ts` (`EVAL_PROVIDER` / `EVAL_GROQ_MODEL`).

## Suites

1. **Consistency** — one fixed route queried 10×; reports score variance/σ/spread.
2. **Grounding** — scans tips for claims of lighting/crowd/visibility/surveillance
   the model cannot know from two address strings + a clock; reports the
   ungrounded-claim rate.
3. **Range / schema** — audits every real score for type + `[1,10]` range, and
   probes the original production validator predicate with synthetic values to
   expose the range gap.
4. **Injection** — 6 payloads that smuggle instructions into the destination
   string (3 trials each); reports the injection success rate.

## Run

```bash
# from the Safestep/ project root, with GROQ_API_KEY (and GOOGLE_API_KEY for the
# provider-health probe) in .env.local
npx tsx evals/run-evals.ts
```

Outputs:

- `evals/RESULTS.md` — human-readable report with real numbers.
- `evals/results.json` — every raw sample (no cherry-picking).

## Hard rules honored

- Real API calls only — no synthetic model output.
- If the key is missing or every call fails, `RESULTS.md` says so instead of
  inventing numbers.
- The full raw payload set is written to `results.json` for auditability.

> Cost/quota: ~33 calls per run, spaced 2.5 s apart (Groq free tier ~30 RPM),
> ≈2 min wall-clock. Note: Gemini's free tier caps `gemini-2.5-flash` at 20
> requests/day, which is why the suite runs on Groq rather than a live Gemini model.
