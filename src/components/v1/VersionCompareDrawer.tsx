import React from 'react';
import type { GalleryVersionRecord } from './galleryTypes';

type VersionCompareDrawerProps = {
  current: GalleryVersionRecord | null;
  previous: GalleryVersionRecord | null;
  onClose: () => void;
};

export function VersionCompareDrawer({ current, previous, onClose }: VersionCompareDrawerProps) {
  if (!current || !previous) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,23,42,0.4)] p-4 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-5xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Version compare</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{current.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{current.verdict || current.summary}</div>
            <p className="mt-3 text-sm leading-7 text-slate-700">{current.summary}</p>
          </section>
          <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Previous</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{previous.verdict || previous.summary}</div>
            <p className="mt-3 text-sm leading-7 text-slate-700">{previous.summary}</p>
          </section>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">
              {Math.round((current.trust_layer?.confidence_score || 0) * 100)}% vs {Math.round((previous.trust_layer?.confidence_score || 0) * 100)}%
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">State</div>
            <div className="mt-3 text-lg font-semibold capitalize text-slate-950">
              {(current.card_state_ui || current.card_state || 'published').replace(/_/g, ' ')} vs {(previous.card_state_ui || previous.card_state || 'published').replace(/_/g, ' ')}
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Drivers snapshot</div>
            <div className="mt-3 text-sm leading-7 text-slate-700">
              {(current.drivers || []).slice(0, 2).map((driver) => driver.feature_key.replace(/_/g, ' ')).join(', ') || 'No drivers'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
