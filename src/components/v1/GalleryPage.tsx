import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { SavedCardGrid } from './SavedCardGrid';
import { CardDetailView } from './CardDetailView';
import { VersionCompareDrawer } from './VersionCompareDrawer';
import type { GalleryCardRecord, GalleryVersionRecord } from './galleryTypes';

type GalleryPageProps = {
  user: User | null;
  onLogin: () => void;
};

function sortCards(cards: GalleryCardRecord[], sort: 'recent' | 'confidence') {
  const next = [...cards];
  if (sort === 'confidence') {
    return next.sort((a, b) => (b.trust_confidence || 0) - (a.trust_confidence || 0));
  }
  return next.sort((a, b) => toSortNumber(b.updatedAt || b.savedAt) - toSortNumber(a.updatedAt || a.savedAt));
}

function toSortNumber(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    if ('seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
      return Number((value as { seconds: number }).seconds) * 1000;
    }
    if ('toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().getTime();
    }
  }
  return 0;
}

export function GalleryPage({ user, onLogin }: GalleryPageProps) {
  const [cards, setCards] = useState<GalleryCardRecord[]>([]);
  const [versions, setVersions] = useState<GalleryVersionRecord[]>([]);
  const [selected, setSelected] = useState<GalleryCardRecord | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'published' | 'limited' | 'coverage_gap'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'confidence'>('recent');
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setCards([]);
      setVersions([]);
      setSelected(null);
      return;
    }

    let active = true;

    void getDocs(collection(db, 'users', user.uid, 'cards')).then((snapshot) => {
      if (!active) return;
      const records = snapshot.docs.map(
        (docSnapshot) =>
          ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<GalleryCardRecord, 'id'>),
          }) satisfies GalleryCardRecord
      );
      setCards(records);
      setSelected((current) => current || records[0] || null);
    });

    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !selected?.id) {
      setVersions([]);
      return;
    }

    let active = true;
    void getDocs(collection(db, 'users', user.uid, 'cards', selected.id, 'versions')).then((snapshot) => {
      if (!active) return;
      const records = snapshot.docs.map(
        (docSnapshot) =>
          ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<GalleryVersionRecord, 'id'>),
          }) satisfies GalleryVersionRecord
      );
      records.sort(
        (a, b) =>
          toSortNumber(b.version_saved_at || b.updatedAt || b.savedAt) -
          toSortNumber(a.version_saved_at || a.updatedAt || a.savedAt)
      );
      setVersions(records);
    });

    return () => {
      active = false;
    };
  }, [selected?.id, user?.uid]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = cards.filter((card) => {
      const matchesSearch =
        !normalizedSearch ||
        [card.title, card.summary, card.query_text, card.entity_label, card.domain_label]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesState =
        stateFilter === 'all' || (card.card_state_ui || card.card_state || 'published') === stateFilter;

      return matchesSearch && matchesState;
    });

    return sortCards(filtered, sortBy);
  }, [cards, search, sortBy, stateFilter]);

  if (!user) {
    return (
      <section className="rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Private Gallery</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">Your prediction library lives here.</h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Save cards, revisit versions, search past forecasts, and compare how the read changed over time. Public discovery now lives in Forecast Gallery; this space stays personal.
          </p>
          <button
            type="button"
            onClick={onLogin}
            className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Sign in to unlock Gallery
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Private Gallery</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">Saved cards, followed themes, version memory.</h1>
            <p className="mt-4 text-base leading-8 text-slate-600">
              Search across your saved forecasts, inspect trust and evidence, and compare the current read against earlier versions without mixing this space up with the public discovery layer.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cards"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            >
              <option value="all">All states</option>
              <option value="published">Published</option>
              <option value="limited">Limited</option>
              <option value="coverage_gap">Coverage gap</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            >
              <option value="recent">Most recent</option>
              <option value="confidence">Highest confidence</option>
            </select>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SavedCardGrid cards={filteredCards} selectedId={selected?.id || null} onSelect={setSelected} />
        <CardDetailView card={selected} versions={versions} onOpenCompare={() => setIsCompareOpen(true)} />
      </div>

      {isCompareOpen ? (
        <VersionCompareDrawer
          current={versions[0] || null}
          previous={versions[1] || null}
          onClose={() => setIsCompareOpen(false)}
        />
      ) : null}
    </>
  );
}
