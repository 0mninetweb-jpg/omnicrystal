import React from 'react';
import { Link } from 'react-router-dom';
import { sanitizeDisplayText } from '../../lib/displayText';
import { getForecastMetaCopy } from '../../lib/forecastV1';
import type { GalleryCardRecord, GalleryVersionRecord } from './galleryTypes';
import { TrustStrip } from './TrustStrip';
import { EvidenceDrawer } from './EvidenceDrawer';

type CardDetailViewProps = {
  card: GalleryCardRecord | null;
  versions: GalleryVersionRecord[];
  onOpenCompare: () => void;
};

export function CardDetailView({ card, versions, onOpenCompare }: CardDetailViewProps) {
  if (!card) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/70 p-8 text-sm leading-7 text-slate-600">
        Select a card to inspect trust, evidence, and versions.
      </div>
    );
  }

  const meta = getForecastMetaCopy(card);
  const title = sanitizeDisplayText(card.title, 'Crystal forecast');
  const summary = sanitizeDisplayText(card.summary, 'No summary available yet.');
  const primaryOutcome = sanitizeDisplayText(card.verdict || card.summary, summary);

  return (
    <section className="space-y-5">
      <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {sanitizeDisplayText(card.entity_label, 'Auto')} / {sanitizeDisplayText(card.horizon_label, '30 days')}
            </div>
            {meta.runDateSummary ? <div className="mt-2 text-sm font-medium text-slate-600">Forecast run {meta.runDateSummary}</div> : null}
            {meta.relativeTimeSummary ? <div className="mt-1 text-sm text-slate-500">{meta.relativeTimeSummary}</div> : null}
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{summary}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={onOpenCompare}
              disabled={versions.length < 2}
              title={versions.length < 2 ? 'Save at least two versions to compare changes.' : 'Compare the two latest saved versions.'}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Compare versions
            </button>
            {versions.length < 2 ? (
              <div className="text-xs font-medium text-slate-500">Save at least two versions to unlock compare.</div>
            ) : null}
          </div>
        </div>

        {card.public_slug ? (
          <div className="mt-4">
            <Link
              to={`/forecast-gallery/forecast/${card.public_slug}`}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Open public forecast page
            </Link>
          </div>
        ) : null}

        <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
          Gallery is the private memory layer for this forecast. Save keeps the current card, the public page stays shareable,
          and version history shows what changed over time.
        </div>

        <div className="mt-5 rounded-[28px] bg-slate-950 p-5 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Primary outcome</div>
          <div className="mt-3 text-xl font-semibold tracking-[-0.03em]">{primaryOutcome}</div>
        </div>

        <TrustStrip
          className="mt-5"
          trustLayer={card.trust_layer}
          freshnessSummary={meta.freshnessSummary}
          provenanceSummary={meta.provenanceSummary}
          runDateSummary={meta.runDateSummary}
        />

        <div className="mt-5">
          <EvidenceDrawer evidence={card.evidence_drawer} />
        </div>
      </article>

      <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Version history</div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{versions.length} saved versions</div>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          This is the proof trail for the forecast. Compare versions when you want to see whether the call, confidence, or
          drivers actually changed.
        </p>
        <div className="mt-4 space-y-3">
          {versions.map((version) => (
            <div key={version.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{version.version_id || version.card_id || version.id}</div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {(version.card_state_ui || version.card_state || 'published').replace(/_/g, ' ')}
                </div>
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-700">{sanitizeDisplayText(version.summary, 'No summary available yet.')}</div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
