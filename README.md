<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Crystal Oracle

Crystal now ships with:

- the existing Firebase/React app
- the server-side prediction layer in `functions/`
- an optional `world-sim/` sidecar for the Oracle path inspired by a MiroFish-style graph -> simulation -> report workflow

## Run locally

1. Install frontend dependencies:
   `npm install`
2. Install functions dependencies:
   `cd functions && npm install`
3. Configure `.env` / Firebase secrets.
4. Run the frontend:
   `npm run dev`

## Optional Oracle WorldSim sidecar

The Oracle path can call a dedicated Python sidecar.

1. Go to [`world-sim/`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/world-sim/README.md)
2. Start the service on `http://localhost:8081`
3. Set:
   - `WORLDSIM_BASE_URL`
   - `WORLDSIM_API_KEY`

If the sidecar is not configured, Crystal falls back to an internal server-side WorldSim generation path inside Firebase Functions.

## Cloud Run deploy

When `omnicrystal` is on `Blaze`, you can deploy the sidecar with:

```powershell
cd world-sim
.\deploy-cloudrun.ps1
```

Then copy the resulting values into:

- [`functions/.env.example`](C:/Users/Fiorenza/OneDrive/Desktop/Codex/crystal-review-0316/functions/.env.example) as a real `functions/.env.omnicrystal`
- or your deployed Functions runtime env

Current blocker from this machine:

- `Cloud Run` / `Secret Manager` operations require the Firebase project to be on `Blaze`
- `gcloud` is not installed yet on this PC
