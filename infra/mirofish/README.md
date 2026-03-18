# MiroFish Core Deploy Kit

This folder contains the operational assets for the `original MiroFish runtime on GCE VM + Crystal WorldSim adapter on Cloud Run` topology.

## Files

- `provision-gcp.ps1`: creates the VM, VPC connector, and firewall rule for the private runtime
- `setup-vm.sh`: installs Python, `uv`, the original MiroFish repo, and the backend dependencies on the VM
- `configure-openrouter-runtime.py`: patches the original MiroFish runtime for stage-specific OpenRouter models
- `mirofish.service`: `systemd` unit for the original MiroFish backend
- `mirofish.vm.env.example`: minimal `.env` for the original MiroFish runtime
- `functions.env.omnicrystal.example`: adapter + forecast env values to mirror into Firebase Functions
- `deploy-firebase.ps1`: writes the adapter and OpenRouter forecast env into `functions/.env.omnicrystal`, checks required Function secrets, and deploys Functions / Firestore / Hosting
- `smoke-test.ps1`: end-to-end smoke test for the adapter contract
- `rollout-openrouter.ps1`: end-to-end rollout runner for `VM -> Cloud Run -> smoke test -> Firebase`, using OpenRouter on the VM

## Ordered rollout

1. Run `provision-gcp.ps1` from a machine with `gcloud` already authenticated via `cmd /c gcloud auth login`.
2. Copy `mirofish.vm.env.example` to the VM as `/opt/mirofish/.env` and fill the real secrets later.
3. Copy `setup-vm.sh`, `configure-openrouter-runtime.py`, and `mirofish.service` to the VM and run `setup-vm.sh` as root.
4. Confirm the original runtime responds on the VM at `http://<internal-ip>:5001`.
5. Deploy the adapter with [`world-sim/deploy-cloudrun.ps1`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/world-sim/deploy-cloudrun.ps1), passing the VM internal URL and the VPC connector name.
6. Run `smoke-test.ps1` against the Cloud Run adapter.
7. Run `deploy-firebase.ps1` with the adapter URL, WorldSim API key, and OpenRouter key to wire Functions, Firestore, and Hosting.

Or use the new single-command runner:

```powershell
powershell -ExecutionPolicy Bypass -File .\rollout-openrouter.ps1 `
  -OpenRouterApiKey "<OPENROUTER_API_KEY>" `
  -ZepApiKey "<ZEP_API_KEY>"
```

This script:

- provisions the VM and connector if needed
- uploads the VM env and setup assets
- patches the original runtime for stage-specific OpenRouter models
- deploys Cloud Run with fallback ON
- runs the adapter smoke test
- deploys Firebase only if login and required secrets are already available, passing the OpenRouter forecast env through to Functions

## OpenRouter VM defaults

The VM template now assumes an OpenRouter-backed runtime:

- `LLM_BASE_URL=https://openrouter.ai/api/v1`
- `LLM_MODEL_NAME=openai/gpt-4.1-mini`
- `MIROFISH_GRAPH_MODEL=openai/gpt-4.1-mini`
- `MIROFISH_SIM_MODEL=openai/gpt-4.1-mini`
- `MIROFISH_REPORT_MODEL=openai/gpt-4.1`

`configure-openrouter-runtime.py` patches the cloned original repo so graph, simulation, and report stages can resolve different models while still falling back to `LLM_MODEL_NAME`.

## Expected topology

- `Firebase Functions` -> public backend for Crystal
- `Cloud Run adapter` -> public async WorldSim contract
- `GCE VM` -> private original MiroFish backend
- `Serverless VPC Access` -> private path from Cloud Run to the VM

## Windows note

If PowerShell blocks `gcloud.ps1`, these scripts resolve `gcloud.cmd` automatically. You can also invoke them explicitly with:

```powershell
powershell -ExecutionPolicy Bypass -File .\provision-gcp.ps1
```
