# Crystal WorldSim Sidecar

This is a lightweight, MiroFish-style sidecar for Crystal's Oracle path.

It exposes:

- `GET /health`
- `POST /graph/build`
- `POST /simulation/run`
- `POST /report/generate`
- `POST /simulate`

The current implementation is intentionally lightweight:

- it mirrors the shape of a graph -> simulation -> report pipeline
- it can run locally or in a container
- it is API-compatible with the adapter added in `functions/index.js`
- it is designed to be replaced later by a fuller MiroFish/OASIS/Zep runtime

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
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Then point Crystal Functions to it with:

```env
WORLDSIM_BASE_URL=http://localhost:8081
WORLDSIM_API_KEY=change-me
```
