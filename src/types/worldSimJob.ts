export type WorldSimJobKind = 'observe' | 'matrix_intervention';

export type WorldSimJobStatus =
  | 'created'
  | 'preparing'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface WorldSimJobRef {
  jobId: string;
  kind?: WorldSimJobKind;
  status: WorldSimJobStatus;
  createdAt: string;
  lastUpdatedAt: string;
  source: string;
  template: string;
  progress: number;
  agentCount: number;
  depth?: string;
  queue?: string;
  statusMessage?: string;
  phase?: string;
  runtime?: string;
  adapterMode?: string;
  provider?: string;
  models?: {
    default?: string;
    graph?: string;
    simulation?: string;
    report?: string;
  };
  branchId?: string | null;
  branchParentId?: string | null;
}

export interface WorldSimJobDetail extends WorldSimJobRef {
  completedAt?: string | null;
  canceledAt?: string | null;
  errorMessage?: string | null;
  resultAvailable?: boolean;
  previewSummary?: string;
  queryText?: string;
  sourceRef?: string | null;
}

export interface WorldSimJobResult<TDigest = unknown, TCard = unknown, TSection = unknown, TMatrix = unknown> {
  job: WorldSimJobDetail;
  digest: TDigest | null;
  card: TCard | null;
  section: TSection | null;
  matrix?: TMatrix | null;
}

export type MatrixSimulationJobRef = WorldSimJobRef;
export type MatrixSimulationJobDetail = WorldSimJobDetail;

export function isTerminalWorldSimJobStatus(status?: string | null): status is WorldSimJobStatus {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}
