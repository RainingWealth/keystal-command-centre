# Narration script and timing

Voice: Kokoro-82M `af_heart` at 0.92× (Apache-2.0 model; generated locally). Total video 57.8 s.

| Scene | Video time | Voice-over | Name | Narration (caption text) |
|---|---|---|---|---|
| S1 |   0.0–  6.2 s |   0.2–  5.5 s | Hook | You built this business with a partner. But if they suddenly passed away... who would own their shares? |
| S2 |   6.2– 16.9 s |   6.4– 16.2 s | OwnershipRisk | Their shares may pass to their estate. You could end up sharing ownership with people who never planned to be involved. And their family may need cash, not shares. |
| S3 |  16.9– 26.9 s |  17.2– 26.1 s | Agreement | A buy-sell agreement sets out what happens when a specific event occurs: who can buy the shares, how the price is set, and the terms of the transfer. |
| S4 |  26.9– 34.5 s |  27.1– 32.9 s | FundingGap | But here's what many business owners overlook: an agreement doesn't give you the cash to buy the shares. |
| S5 |  34.5– 45.3 s |  34.8– 43.3 s | InsuranceSolution | Properly structured insurance can help fund the buyout, subject to policy terms, claims requirements, and how the arrangement is set up. |
| S6 |  45.3– 57.8 s |  45.6– 53.8 s | CallToAction | If you share your business with other shareholders, don't leave succession to chance. Book a 15-minute shareholder continuity review. |

Word-level timings live in `src/data/timeline.json` (built from `script/voice_timings.json`).

## What changed from the handoff script (meaning unchanged)

- S1 "But what happens to their shares if they suddenly pass away?" → "But if they suddenly passed away… who would own their shares?" (ends on the question the headline asks).
- S2 "running the business alongside people…" → "**sharing ownership** with people who never planned to be involved", and "may need cash, not shares". This avoids implying heirs automatically get management rights. On-screen footnote: outcomes depend on the company's constitution, shareholder arrangements and applicable law.
- S3 "when specific events occur" → "when a specific event occurs"; "terms of the transfer" kept.
- S4 "doesn't mean you have the cash" → "doesn't give you the cash". Figures on screen (S$1,500,000 / S$300,000 / S$1,200,000) are labelled illustrative.
- S5 wording kept ("can help fund", "subject to policy terms…"). Visual: proceeds only flow after three conditions tick (insured event, policy terms met, claim admitted), footnote repeats that payouts depend on them.
- S6 "Start with a 15-minute…" → "Book a fifteen-minute shareholder continuity review." (captions show "15-minute").

## Compliance copy on screen

- S2: "Outcomes depend on the company's constitution, shareholder arrangements and applicable law."
- S4: "Illustrative figures only."
- S5: "Payouts depend on the insured event, policy terms and claims assessment."
- End card: "General information only. Not financial, legal or tax advice."
