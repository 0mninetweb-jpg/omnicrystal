import React from 'react';
import type { GalleryCardRecord } from './galleryTypes';
import { cn } from '../../lib/ui';

type SavedCardGridProps = {
  cards: GalleryCardRecord[];
  selectedId: string | null;
  onSelect: (card: GalleryCardRecord) => void;
};

export function SavedCardGrid({ cards, selectedId, onSelect }: SavedCardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/70 p-8 text-sm leading-7 text-slate-600">
        No cards yet. Save a forecast to build your Gallery.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelect(card)}
          className={cn(
            'rounded-[28px] border p-5 text-left transition',
            selectedId === card.id
              ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_44px_rgba(15,23,42,0.12)]'
              : 'border-slate-200 bg-white text-slate-900 shadow-[0_18px_44px_rgba(15,23,42,0.05)] hover:border-slate-300'
          )}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
            {(card.card_state_ui || card.card_state || 'published').replace(/_/g, ' ')}
          </div>
          <div className="mt-3 text-lg font-semibold tracking-[-0.02em]">{card.title}</div>
          <div className="mt-2 text-sm leading-7 opacity-80">{card.summary}</div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
            <span>{card.entity_label || 'Auto'}</span>
            <span>{card.horizon_label || '30 days'}</span>
            <span>{Math.round((card.trust_confidence || card.trust_layer?.confidence_score || 0) * 100)}%</span>
          </div>
        </button>
      ))}
    </div>
  );
}
