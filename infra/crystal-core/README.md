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
- `Cloud Run Job (crystal-core-eval)` runs resolution, evaluation, sports calibration, and report sweeps

## Ordered rollout

1. Deploy `crystal-core` with `deploy-cloudrun.ps1`
2. Run `smoke-test.ps1` against the returned service URL
3. Copy the values from `functions.env.omnicrystal.example` into `functions/.env.omnicrystal`
4. Deploy Firebase Functions and Firestore Rules
5. Start with `CRYSTAL_CORE_ROLLOUT_PERCENT=0` and `CRYSTAL_CORE_GUEST_ROLLOUT_PERCENT=0`
6. Raise rollout manually only after the evaluation reports stay healthy

## Evaluation and closeout sequence

Use the evaluation job as the standard source of truth for calibration/reporting, not workstation-only auth:

1. parity/probe
2. sports calibration report
3. domain matrix
4. phase-a closeout

`report:sports-calibration` should trigger `crystal-core-eval` in `sports_calibration` mode and fetch the persisted Firestore artifact back into `docs/`.

## Billing and Artifact Registry prerequisites

Before the evaluation job can run reliably, the GCP project must have billing enabled and the Cloud Run service agent must be able to read the build image from Artifact Registry.

Required bindings on repository `cloud-run-source-deploy` in `europe-west1`:

- `service-294034419055@serverless-robot-prod.iam.gserviceaccount.com` -> `roles/artifactregistry.reader`
- optional but recommended: `294034419055-compute@developer.gserviceaccount.com` -> `roles/artifactregistry.reader`

Suggested sequence:

1. Reactivate billing for project `omnicrystal`
2. Try the repository-level bindings first:
   - `gcloud artifacts repositories add-iam-policy-binding cloud-run-source-deploy --location=europe-west1 --project=omnicrystal --member=serviceAccount:service-294034419055@serverless-robot-prod.iam.gserviceaccount.com --role=roles/artifactregistry.reader`
   - `gcloud artifacts repositories add-iam-policy-binding cloud-run-source-deploy --location=europe-west1 --project=omnicrystal --member=serviceAccount:294034419055-compute@developer.gserviceaccount.com --role=roles/artifactregistry.reader`
3. If Artifact Registry still rejects the binding or reports stale billing state, use the project-level fallback:
   - `gcloud projects add-iam-policy-binding omnicrystal --member=serviceAccount:service-294034419055@serverless-robot-prod.iam.gserviceaccount.com --role=roles/artifactregistry.reader --condition=None`
   - `gcloud projects add-iam-policy-binding omnicrystal --member=serviceAccount:294034419055-compute@developer.gserviceaccount.com --role=roles/artifactregistry.reader --condition=None`
4. Wait a few minutes for billing/IAM propagation if the Cloud Run Job still reports image-read permission errors.
5. Run `npm run report:sports-calibration`
6. Run `powershell -ExecutionPolicy Bypass -File scripts/run-phase-a-closeout.ps1`

The calibration artifact should then report one of:

- `unavailable`: the job did not complete operationally
- `warming_up`: the artifact exists but sample size is still below the sports calibration floor
- `active`: the artifact exists and the calibration sample floor is met

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
