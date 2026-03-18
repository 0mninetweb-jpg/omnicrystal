<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Crystal Oracle

Crystal now ships with:

- the existing Firebase/React app
- the server-side prediction layer in `functions/`
- an optional `world-sim/` adapter that can run in fallback mode or orchestrate the original MiroFish/OASIS runtime on a dedicated VM

## Run locally

1. Install frontend dependencies:
   `npm install`
2. Install functions dependencies:
   `cd functions && npm install`
3. Configure `.env` / Firebase secrets.
4. Run the frontend:
   `npm run dev`

## Optional Oracle WorldSim adapter

The Oracle path can call a dedicated Python adapter.

1. Go to [`world-sim/`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/world-sim/README.md)
2. Start the service on `http://localhost:8081`
3. Set for async WorldSim jobs:
   - `MIROFISH_BASE_URL`
   - `MIROFISH_API_KEY`
4. Optionally set for the legacy synchronous sidecar path:
   - `WORLDSIM_BASE_URL`
   - `WORLDSIM_API_KEY`

If the adapter is not configured against the original VM, it still works in fallback mode and returns a local async WorldSim digest.

## Cloud Run deploy

When `omnicrystal` is on `Blaze`, you can deploy the sidecar with:

```powershell
cd world-sim
.\deploy-cloudrun.ps1
```

For the full `GCE VM + Cloud Run adapter` rollout, use the step-by-step operational kit in [infra/mirofish](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/infra/mirofish/README.md).

Then copy the resulting values into:

- [`functions/.env.example`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/functions/.env.example) as a real `functions/.env.omnicrystal`
- or your deployed Functions runtime env

Current blocker from this machine:

- the project is on `Blaze`, but `gcloud` still needs an authenticated account before VM / Cloud Run deploy
- the real runtime secrets (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`, `ZEP_API_KEY`) still need to be filled before the original MiroFish VM can go fully live

## Hybrid runtime direction

Crystal currently keeps a hybrid backend plan:

- `Forecast` stays Gemini-backed inside Firebase Functions for Google-grounded flows
- `WorldSim` and `Matrix Simulation` are prepared to run through the original MiroFish VM with `OpenRouter` as the OpenAI-compatible provider

The VM deploy kit under [infra/mirofish](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/infra/mirofish/README.md) now includes OpenRouter-first defaults and stage-specific model wiring for graph, simulation, and report phases.
