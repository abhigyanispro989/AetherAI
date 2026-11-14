# AetherAI

AetherAI includes Learnova and the AetherTech site guide. The Gemini key is a Cloudflare Worker secret named `GEMINI_API_KEY`; the local `.env.local` file is intentionally ignored by Git. Never commit that file or paste the key into source code.

Build the Cloudflare Worker bundle from this repository root with:

```sh
node scripts/build-worker.mjs
```

The generated Worker entry point is `dist/server/index.js`. The Worker expects the `GEMINI_API_KEY` secret and optionally accepts `GEMINI_MODEL` as a regular variable.
