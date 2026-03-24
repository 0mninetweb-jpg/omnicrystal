# Crystal Core Deploy Kit

This folder contains the operational assets for the `crystal-core` rollout:

- `deploy-cloudrun.ps1`: build + deploy the private Cloud Run service and the evaluation job, create the Cloud Tasks queue, and add invoker bindings
- `smoke-test.ps1`: health / compile / run smoke test against the private Cloud Run service
- `functions.env.omnicrystal.example`: env values to mirror into `functions/.env.omnicrystal`
- `cloudrun.job.env.example`: default offline evaluation worker values

## Expected topology

- `Firebase Functions` remains the public Crystal gateway
- `Cloud Run service (crystal-core)` runs deep forecast planning / evidence / fusion
- `Cloud Tasks` executes queued `forecast_runs`
- `Cloud Run Job (crystal-core-eval)` runs resolution, evaluation, and report sweeps

## Ordered rollout

1. Deploy `crystal-core` with `deploy-cloudrun.ps1`
2. Run `smoke-test.ps1` against the returned service URL
3. Copy the values from `functions.env.omnicrystal.example` into `functions/.env.omnicrystal`
4. Deploy Firebase Functions and Firestore Rules
5. Start with `CRYSTAL_CORE_ROLLOUT_PERCENT=0` and `CRYSTAL_CORE_GUEST_ROLLOUT_PERCENT=0`
6. Raise rollout manually only after the evaluation reports stay healthy

## Runtime config parity

`crystal-core` needs the same LLM runtime settings as Firebase Functions when it is expected to behave the same way in production. In practice, mirror these values into the Cloud Run deploy:

- `LLM_PROVIDER`
- `LLM_BASE_URL`
- `LLM_API_KEY` when using OpenRouter as primary
- `LLM_MODEL_QUERY`
- `LLM_MODEL_FORECAST`
- `LLM_MODEL_CHAT`
- `LLM_MODEL_COPY`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_APP_TITLE`

`GEMINI_API_KEY` still comes from Secret Manager and remains the fallback or primary key when `LLM_PROVIDER=gemini`.
