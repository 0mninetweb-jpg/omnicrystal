# MiroFish Core Deploy Kit

This folder contains the operational assets for the `original MiroFish runtime on GCE VM + Crystal WorldSim adapter on Cloud Run` topology.

## Files

- `provision-gcp.ps1`: creates the VM, VPC connector, and firewall rule for the private runtime
- `setup-vm.sh`: installs Python, `uv`, the original MiroFish repo, and the backend dependencies on the VM
- `mirofish.service`: `systemd` unit for the original MiroFish backend
- `mirofish.vm.env.example`: minimal `.env` for the original MiroFish runtime
- `functions.env.omnicrystal.example`: adapter env values to mirror into Firebase Functions
- `deploy-firebase.ps1`: writes the adapter env into `functions/.env.omnicrystal`, checks required Function secrets, and deploys Functions / Firestore / Hosting
- `smoke-test.ps1`: end-to-end smoke test for the adapter contract

## Ordered rollout

1. Run `provision-gcp.ps1` from a machine with `gcloud` already authenticated via `cmd /c gcloud auth login`.
2. Copy `mirofish.vm.env.example` to the VM as `/opt/mirofish/.env` and fill the real secrets later.
3. Copy `setup-vm.sh` and `mirofish.service` to the VM and run `setup-vm.sh` as root.
4. Confirm the original runtime responds on the VM at `http://<internal-ip>:5001`.
5. Deploy the adapter with [`world-sim/deploy-cloudrun.ps1`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/world-sim/deploy-cloudrun.ps1), passing the VM internal URL and the VPC connector name.
6. Run `smoke-test.ps1` against the Cloud Run adapter.
7. Run `deploy-firebase.ps1` with the adapter URL and API key to wire Functions, Firestore, and Hosting.

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
