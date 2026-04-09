import {
  APPWRITE_DATABASE_ID,
  executeForecastRunNow,
  getDbCompat,
  listPendingWorldSimJobs,
  readMatrixWorldSimJobResult,
  readObserveWorldSimJobResult,
  runEvaluationMode,
  safeText,
} from './shared/crystal-runtime.mjs';

function parsePayload(req) {
  const raw = req?.body ?? req?.payload ?? req?.data;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

async function collectStatus() {
  const db = getDbCompat();
  const [worldsimJobs, publicForecasts, forecastRuns] = await Promise.all([
    db.collection('worldsim_jobs').limit(50).get().catch(() => ({ docs: [] })),
    db.collection('public_forecasts').limit(50).get().catch(() => ({ docs: [] })),
    db.collection('forecast_runs').limit(50).get().catch(() => ({ docs: [] })),
  ]);

  return {
    pendingWorldSimJobs: worldsimJobs.docs.filter((doc) => !['completed', 'failed', 'canceled'].includes(String(doc.data()?.status || ''))).length,
    publicForecastRows: publicForecasts.docs.length,
    forecastRunRows: forecastRuns.docs.length,
  };
}

async function runWorldSimSweep(limit = 25) {
  const jobs = await listPendingWorldSimJobs(limit);
  const refreshed = [];

  for (const job of jobs) {
    if (!job?.jobId || !job?.uid) continue;
    if (safeText(job.jobType) === 'matrix_intervention') {
      refreshed.push(await readMatrixWorldSimJobResult(job.uid, job.jobId));
    } else {
      refreshed.push(await readObserveWorldSimJobResult(job.uid, job.jobId));
    }
  }

  return {
    pending_before: jobs.length,
    processed: refreshed.length,
  };
}

async function runAllModes(trigger = 'manual_batch') {
  const evaluationModes = ['resolution', 'evaluation', 'sports_calibration', 'report'];
  const evaluation = [];

  for (const mode of evaluationModes) {
    evaluation.push({
      mode,
      result: await runEvaluationMode(mode, {}),
    });
  }

  return {
    trigger,
    evaluation,
    worldsim: await runWorldSimSweep(50),
  };
}

export default async ({ req, res }) => {
  const payload = parsePayload(req);
  const action = safeText(payload.action);
  const mode = safeText(payload.mode);

  try {
    if (action === 'run-forecast') {
      return res.json({ ok: true, result: await executeForecastRunNow(payload.payload || {}) }, 200);
    }

    if (action === 'run-eval' && mode) {
      const result = await runEvaluationMode(mode, {
        reportType: safeText(payload.reportType),
        lookbackDays: Number(payload.lookbackDays) || undefined,
        backfillLookbackDays: Number(payload.backfillLookbackDays) || undefined,
        limit: Number(payload.limit) || undefined,
        outputDate: safeText(payload.outputDate),
      });
      return res.json({ ok: true, result }, 200);
    }

    if (action === 'run-worldsim') {
      return res.json({ ok: true, result: await runWorldSimSweep(Number(payload.limit) || 25) }, 200);
    }

    if (action === 'run-all') {
      return res.json({ ok: true, result: await runAllModes(req?.schedule ? 'schedule' : 'manual_batch') }, 200);
    }

    const status = await collectStatus();
    return res.json(
      {
        ok: true,
        job: 'crystal-jobs',
        trigger: req?.schedule ? 'schedule' : req?.method || 'unknown',
        databaseId: APPWRITE_DATABASE_ID,
        note: 'Jobs runtime is active and running in-process inside Appwrite.',
        ...status,
      },
      200
    );
  } catch (error) {
    return res.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};
