import React from 'react';
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

  return (
    <section className="space-y-5">
      <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {card.entity_label || 'Auto'} · {card.horizon_label || '30 days'}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{card.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{card.summary}</p>
          </div>
          <button
            type="button"
            onClick={onOpenCompare}
            disabled={versions.length < 2}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50"
          >
            Compare versions
          </button>
        </div>

        <div className="mt-5 rounded-[28px] bg-slate-950 p-5 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Primary outcome</div>
          <div className="mt-3 text-xl font-semibold tracking-[-0.03em]">{card.verdict || card.summary}</div>
        </div>

        <TrustStrip
          className="mt-5"
          trustLayer={card.trust_layer}
          freshnessSummary={card.evidence_drawer?.freshness_summary?.as_of_utc || undefined}
          provenanceSummary={card.trust_layer?.provenance_summary?.verification_level}
        />

        <div className="mt-5">
          <EvidenceDrawer evidence={card.evidence_drawer} />
        </div>
      </article>

      <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Version history</div>
        <div className="mt-4 space-y-3">
          {versions.map((version) => (
            <div key={version.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{version.version_id || version.card_id || version.id}</div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {(version.card_state_ui || version.card_state || 'published').replace(/_/g, ' ')}
                </div>
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-700">{version.summary}</div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
