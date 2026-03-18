# Crystal WorldSim Adapter

This service now does two jobs:

- it keeps the original lightweight `graph -> simulation -> report` fallback endpoints
- it exposes the async `/worldsim/jobs/*` contract that Crystal already uses for the real WorldSim chamber

## Endpoints

- `GET /health`
- `POST /graph/build`
- `POST /simulation/run`
- `POST /report/generate`
- `POST /simulate`
- `POST /worldsim/jobs`
- `GET /worldsim/jobs/:id`
- `GET /worldsim/jobs/:id/result`
- `POST /worldsim/jobs/:id/cancel`

## Two modes

### 1. Fallback mode

If `MIROFISH_BACKEND_URL` is empty, the adapter still works.

It will:

- accept async WorldSim jobs from Crystal
- progress them through `created -> preparing -> ready -> running -> completed`
- generate a local fallback `WorldSimDigest`

This is the safe mode to use before keys, Zep, or the original VM are ready.

### 2. Original runtime mode

If `MIROFISH_BACKEND_URL` is configured, the adapter orchestrates the original MiroFish backend by calling:

- `/api/graph/ontology/generate`
- `/api/graph/build`
- `/api/simulation/create`
- `/api/simulation/prepare`
- `/api/simulation/start`
- `/api/report/generate`

Crystal still talks only to this adapter. The adapter handles the heavy workflow, polling, and result mapping.

## Run locally

```bash
cd world-sim
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

On Windows PowerShell:

```powershell
cd world-sim
powershell -ExecutionPolicy Bypass -File .\validate-local.ps1
```

Or, if you want the manual path:

```powershell
$env:CRYSTAL_PYTHON_EXE="C:\Users\Fiorenza\AppData\Local\Programs\Python\Python312\python.exe"
& $env:CRYSTAL_PYTHON_EXE -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
& $env:CRYSTAL_PYTHON_EXE app.py
```

Then point Crystal Functions to it with:

```env
MIROFISH_BASE_URL=http://localhost:8081
MIROFISH_API_KEY=change-me
```

If you also want the legacy sync path:

```env
WORLDSIM_BASE_URL=http://localhost:8081
WORLDSIM_API_KEY=change-me
```

## Local validation

If Python is installed locally, you can run the adapter validation script:

```powershell
cd world-sim
powershell -ExecutionPolicy Bypass -File .\validate-local.ps1
```

This script:

- creates `.venv` if needed
- installs `requirements.txt`
- runs `py_compile`
- starts the adapter in fallback mode
- executes the shared smoke test

## Adapter env

See [`.env.example`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/world-sim/.env.example).

Main settings:

- `WORLDSIM_API_KEY`: auth from Crystal to this adapter
- `MIROFISH_BACKEND_URL`: URL of the original MiroFish Flask backend on the VM
- `MIROFISH_PROVIDER`: runtime label reported by `/health` for the original VM, default `openrouter`
- `MIROFISH_DEFAULT_MODEL`: fallback model for stage reporting
- `MIROFISH_GRAPH_MODEL`: ontology / graph model label surfaced to Crystal
- `MIROFISH_SIM_MODEL`: OASIS preparation / simulation model label surfaced to Crystal
- `MIROFISH_REPORT_MODEL`: report model label surfaced to Crystal
- `MIROFISH_BACKEND_API_KEY`: optional outbound header for the original backend
- `MIROFISH_BEARER_TOKEN`: optional bearer token for the original backend
- `MIROFISH_POLL_INTERVAL_SEC`: polling cadence for long jobs
- `MIROFISH_JOB_DATA_DIR`: local mirror of adapter job state
- `MIROFISH_ALLOW_FALLBACK`: if `true`, drop back to the local adapter if the original runtime fails

## How the adapter translates Crystal to original MiroFish

For each async WorldSim job, the adapter:

1. builds a synthetic markdown brief from `query + queryPlan + userContext`
2. uploads it to `ontology/generate`
3. builds the graph
4. creates and prepares the simulation
5. starts the OASIS run
6. waits for the report
7. maps the result back into Crystal's `WorldSimDigest`

This lets Crystal stay the product and orchestrator, while the original MiroFish runtime remains the simulation engine.

## OpenRouter-first runtime note

The current VM-first rollout assumes:

- `LLM_BASE_URL=https://openrouter.ai/api/v1` on the original MiroFish VM
- stage-specific models on the VM such as:
  - `MIROFISH_GRAPH_MODEL=openai/gpt-4.1-mini`
  - `MIROFISH_SIM_MODEL=openai/gpt-4.1-mini`
  - `MIROFISH_REPORT_MODEL=openai/gpt-4.1`

The adapter does not need the OpenRouter secret itself. It only mirrors provider and stage-model metadata so Crystal can report that Forecast stays Gemini-backed while WorldSim runs through the MiroFish/OpenRouter VM.

## Deployment helpers

For the VM + Cloud Run rollout, use the operational kit in [infra/mirofish](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/infra/mirofish/README.md).
