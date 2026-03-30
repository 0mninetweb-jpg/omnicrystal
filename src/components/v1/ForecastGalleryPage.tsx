import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Bell, Bookmark, Loader2, LogIn, Share2, Sparkles } from 'lucide-react';
import { buildForecastStack } from '../../lib/forecastV1';
import {
  fetchPublicForecastCollection,
  fetchPublicForecastPageData,
  formatPublicForecastDate,
  formatPublicForecastRunDate,
  formatRelativeTimeInterpretation,
  getPublicForecastState,
  rankTrendingForecasts,
  resolvePublicForecastContext,
  toSortNumber,
  type PublicForecastRecord,
} from '../../lib/publicForecasts';
import { sanitizeDisplayText } from '../../lib/displayText';
import { followForecastEntity, isForecastCardSaved, isForecastEntityFollowed, saveForecastCardToLibrary } from '../../lib/cardLibrary';
import { ResultStack } from './ResultStack';

type ForecastGallerySharedProps = {
  user: User | null;
  onLogin: () => void;
};

function sortByPublished(records: PublicForecastRecord[]) {
  return [...records].sort(
    (left, right) => toSortNumber(right.published_at || right.updatedAt) - toSortNumber(left.published_at || left.updatedAt)
  );
}

function sortBestCalls(records: PublicForecastRecord[]) {
  return [...records].sort((left, right) => {
    const rightScore =
      (right.trust_confidence || right.trust_layer?.confidence_score || 0) +
      (getPublicForecastState(right) === 'published' ? 0.12 : 0);
    const leftScore =
      (left.trust_confidence || left.trust_layer?.confidence_score || 0) +
      (getPublicForecastState(left) === 'published' ? 0.12 : 0);
    return rightScore - leftScore;
  });
}

function PublicForecastLinkCard({ record }: { record: PublicForecastRecord }) {
  const state = getPublicForecastState(record);
  const title = sanitizeDisplayText(record.title, 'Crystal forecast');
  const summary = sanitizeDisplayText(record.summary, 'No summary available yet.');
  const badgeTone =
    state === 'published'
      ? 'bg-emerald-50 text-emerald-700'
      : state === 'limited'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  return (
    <Link
      to={`/forecast-gallery/forecast/${record.public_slug || record.id}`}
      className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {record.entity_label || 'General'} · {record.horizon_label || '30 days'}
        </div>
        <div className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeTone}`}>
          {state.replace(/_/g, ' ')}
        </div>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{sanitizeDisplayText(record.topic_label || record.domain_label || record.domain, record.domain)}</span>
        <span>{Math.round((record.trust_confidence || record.trust_layer?.confidence_score || 0) * 100)}%</span>
        <span>{formatPublicForecastDate(record.published_at || record.updatedAt)}</span>
      </div>
    </Link>
  );
}

function DiscoverySection({
  title,
  body,
  records,
}: {
  title: string;
  body: string;
  records: PublicForecastRecord[];
}) {
  if (records.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
          <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {records.map((record) => (
          <PublicForecastLinkCard key={record.id} record={record} />
        ))}
      </div>
    </section>
  );
}

function EmptyForecastGalleryState() {
  return (
    <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/70 p-8 text-sm leading-7 text-slate-600">
      No public forecasts yet. Generate a live Crystal forecast and the public layer will start filling with real engine cards.
    </section>
  );
}

function ForecastCardSkeleton() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="h-3 w-28 rounded-full bg-slate-100" />
      <div className="mt-4 h-6 w-4/5 rounded-full bg-slate-100" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded-full bg-slate-100" />
        <div className="h-3 w-11/12 rounded-full bg-slate-100" />
        <div className="h-3 w-8/12 rounded-full bg-slate-100" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-7 w-20 rounded-full bg-slate-100" />
        <div className="h-7 w-16 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

function ForecastGalleryLoadingState({ title = 'Loading public forecasts...' }: { title?: string }) {
  return (
    <section className="space-y-4">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="inline-flex items-center gap-3 font-semibold text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          {title}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <ForecastCardSkeleton key={`forecast-gallery-skeleton-${index}`} />
        ))}
      </div>
    </section>
  );
}

function LoadStatusNotice({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
      {message}
    </section>
  );
}

function PublicForecastLoadingState() {
  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading forecast page...
        </div>
        <div className="mt-5 h-10 w-4/5 rounded-full bg-slate-100" />
        <div className="mt-4 space-y-3">
          <div className="h-4 w-full rounded-full bg-slate-100" />
          <div className="h-4 w-11/12 rounded-full bg-slate-100" />
          <div className="h-4 w-8/12 rounded-full bg-slate-100" />
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <ForecastCardSkeleton />
        <ForecastCardSkeleton />
      </div>
    </div>
  );
}

function ExploreLinks({
  title,
  items,
  path,
}: {
  title: string;
  items: Array<{ label: string; slug: string; count: number }>;
  path: 'entity' | 'topic';
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        {items.map((item) => (
          <Link
            key={`${path}-${item.slug}`}
            to={`/forecast-gallery/${path}/${item.slug}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
          >
            {item.label} · {item.count}
          </Link>
        ))}
      </div>
    </section>
  );
}

function usePublicForecasts() {
  const [records, setRecords] = useState<PublicForecastRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetchPublicForecastCollection()
      .then(({ records: nextRecords, warning: nextWarning }) => {
        if (!active) return;
        setRecords(nextRecords.filter((record) => getPublicForecastState(record) !== 'coverage_gap'));
        setWarning(nextWarning);
      })
      .catch((error) => {
        if (!active) return;
        setRecords([]);
        setWarning(error instanceof Error ? error.message : 'Crystal could not load the public proof layer right now.');
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { records, isLoading, warning };
}

export function ForecastGalleryPage({ user }: ForecastGallerySharedProps) {
  const { records, isLoading, warning } = usePublicForecasts();

  const latestCalls = useMemo(() => sortByPublished(records).slice(0, 6), [records]);
  const trending = useMemo(() => rankTrendingForecasts(records).slice(0, 3), [records]);
  const whatCrystalSeesNow = useMemo(() => {
    const byTopic = new Map<string, PublicForecastRecord>();
    for (const record of sortByPublished(records)) {
      const key = record.topic_slug || record.domain;
      if (!byTopic.has(key)) {
        byTopic.set(key, record);
      }
      if (byTopic.size >= 3) break;
    }
    return [...byTopic.values()];
  }, [records]);

  const entityLinks = useMemo(() => {
    const counts = new Map<string, { label: string; slug: string; count: number }>();
    for (const record of records) {
      const slug = record.entity_slug || 'general';
      const current = counts.get(slug);
      if (current) {
        current.count += 1;
      } else {
        counts.set(slug, {
          label: record.entity_label || 'General',
          slug,
          count: 1,
        });
      }
    }
    return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 8);
  }, [records]);

  const topicLinks = useMemo(() => {
    const counts = new Map<string, { label: string; slug: string; count: number }>();
    for (const record of records) {
      const slug = record.topic_slug || 'forecast';
      const current = counts.get(slug);
      if (current) {
        current.count += 1;
      } else {
        counts.set(slug, {
          label: record.topic_label || record.domain_label || record.domain,
          slug,
          count: 1,
        });
      }
    }
    return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 8);
  }, [records]);

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Forecast Gallery</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl">
            Public proof, real engine cards, fast discovery.
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Forecast Gallery is Crystal&apos;s public prediction layer: latest calls, strong reads, entity pages, and shareable cards generated by the real engine.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/forecast"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Ask your own forecast
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/gallery"
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Open your private library
            </Link>
          </div>
        </div>
      </section>

      {isLoading ? (
        <ForecastGalleryLoadingState />
      ) : records.length === 0 ? (
        <>
          <LoadStatusNotice message={warning} />
          <EmptyForecastGalleryState />
        </>
      ) : (
        <>
          <LoadStatusNotice message={warning} />
          <DiscoverySection
            title="Trending Forecasts"
            body="The cards with the strongest mix of recentness, confidence, and public relevance."
            records={trending}
          />
          <DiscoverySection
            title="What Crystal Sees Now"
            body="One current read per active topic so the public layer stays useful, not noisy."
            records={whatCrystalSeesNow}
          />
          <DiscoverySection
            title="Latest Calls"
            body="Fresh engine-generated forecasts entering the public proof layer."
            records={latestCalls}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <ExploreLinks title="Explore by Entity" items={entityLinks} path="entity" />
            <ExploreLinks title="Explore by Topic" items={topicLinks} path="topic" />
          </div>
        </>
      )}
    </div>
  );
}

export function ForecastGalleryEntityPage({ user }: ForecastGallerySharedProps) {
  const { entitySlug = '' } = useParams();
  const { records, isLoading, warning } = usePublicForecasts();
  const matches = useMemo(
    () => sortByPublished(records.filter((record) => (record.entity_slug || 'general') === entitySlug)),
    [entitySlug, records]
  );
  const entityLabel = matches[0]?.entity_label || entitySlug.replace(/-/g, ' ');

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Entity Page</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">{entityLabel}</h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          Public forecast cards linked to this entity. Read the latest calls, inspect confidence, and jump into Forecast for a tailored follow-up.
        </p>
      </section>

      {isLoading ? (
        <ForecastGalleryLoadingState title="Loading entity page..." />
      ) : matches.length === 0 ? (
        <>
          <LoadStatusNotice message={warning} />
          <EmptyForecastGalleryState />
        </>
      ) : (
        <>
          <LoadStatusNotice message={warning} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matches.map((record) => (
              <PublicForecastLinkCard key={record.id} record={record} />
            ))}
          </div>
        </>
      )}

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next step</div>
        <Link to={`/forecast?q=${encodeURIComponent(entityLabel)}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          Ask your own forecast about {entityLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export function ForecastGalleryTopicPage({ user }: ForecastGallerySharedProps) {
  const { topicSlug = '' } = useParams();
  const { records, isLoading, warning } = usePublicForecasts();
  const matches = useMemo(
    () => sortByPublished(records.filter((record) => (record.topic_slug || 'forecast') === topicSlug)),
    [records, topicSlug]
  );
  const topicLabel = matches[0]?.topic_label || topicSlug.replace(/-/g, ' ');

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Topic Page</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">{topicLabel}</h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          A public slice of Crystal&apos;s current calls for this topic, all generated by the real engine and tied back to the ledger.
        </p>
      </section>

      {isLoading ? (
        <ForecastGalleryLoadingState title="Loading topic page..." />
      ) : matches.length === 0 ? (
        <>
          <LoadStatusNotice message={warning} />
          <EmptyForecastGalleryState />
        </>
      ) : (
        <>
          <LoadStatusNotice message={warning} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matches.map((record) => (
              <PublicForecastLinkCard key={record.id} record={record} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ForecastGalleryBestCallsPage({ user }: ForecastGallerySharedProps) {
  const { records, isLoading, warning } = usePublicForecasts();
  const bestCalls = useMemo(() => sortBestCalls(records).slice(0, 12), [records]);

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Best Calls</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">Best calls, filtered through trust not hype.</h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          This page stays intentionally selective: it favors publishable, high-confidence cards that the public layer can stand behind.
        </p>
      </section>

      {isLoading ? (
        <ForecastGalleryLoadingState title="Loading best calls..." />
      ) : (
        <>
          <LoadStatusNotice message={warning} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {bestCalls.map((record) => (
              <PublicForecastLinkCard key={record.id} record={record} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PublicForecastPage({ user, onLogin }: ForecastGallerySharedProps) {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<PublicForecastRecord | null>(null);
  const [related, setRelated] = useState<PublicForecastRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchPublicForecastPageData(slug)
      .then(({ record: nextRecord, related: nextRelated, warning }) => {
        if (!active) return;
        setRecord(nextRecord);
        setRelated(nextRelated);
        setLoadWarning(warning);
      })
      .catch((error) => {
        if (!active) return;
        setRecord(null);
        setRelated([]);
        setLoadWarning(error instanceof Error ? error.message : 'Crystal could not load this public forecast right now.');
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const context = useMemo(() => (record ? resolvePublicForecastContext(record) : null), [record]);
  const items = useMemo(() => (record && context ? buildForecastStack(record, context) : []), [context, record]);

  useEffect(() => {
    if (!record || !context || !user?.uid) {
      setIsSaved(false);
      return;
    }

    void isForecastCardSaved(user.uid, record.query_text || record.query_origin || record.title, context)
      .then(setIsSaved)
      .catch(() => setIsSaved(false));
  }, [context, record, user?.uid]);

  useEffect(() => {
    if (!context || !user?.uid) {
      setIsFollowed(false);
      return;
    }

    void isForecastEntityFollowed(user.uid, context).then(setIsFollowed).catch(() => setIsFollowed(false));
  }, [context, user?.uid]);

  const redirectGuestToSignin = () => {
    navigate(`/signin?next=${encodeURIComponent(`/forecast-gallery/forecast/${slug}`)}`);
  };

  const handleSave = async () => {
    if (!record || !context) return;
    if (!user?.uid) {
      redirectGuestToSignin();
      return;
    }
    setIsSaving(true);
    try {
      await saveForecastCardToLibrary(user.uid, record.query_text || record.query_origin || record.title, context, record, {
        sourceView: 'forecast-gallery-public',
      });
      setIsSaved(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFollow = async () => {
    if (!context) return;
    if (!user?.uid) {
      redirectGuestToSignin();
      return;
    }
    setIsFollowing(true);
    try {
      await followForecastEntity(user.uid, context, { sourceView: 'forecast-gallery-public' });
      setIsFollowed(true);
    } finally {
      setIsFollowing(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/forecast-gallery/forecast/${slug}`;
    if (navigator.share) {
      await navigator.share({
        title: sanitizeDisplayText(record?.title, 'Crystal public forecast'),
        text: sanitizeDisplayText(record?.summary || record?.verdict, ''),
        url: shareUrl,
      });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
  };

  if (isLoading) {
    return <PublicForecastLoadingState />;
  }

  if (!record || !context) {
    return <EmptyForecastGalleryState />;
  }

  const state = getPublicForecastState(record);
  const recordTitle = sanitizeDisplayText(record.title, 'Crystal forecast');
  const recordSummary = sanitizeDisplayText(record.summary, 'No summary available yet.');
  const runDateSummary = formatPublicForecastRunDate(record);
  const relativeTimeSummary = formatRelativeTimeInterpretation(record);

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Forecast Page · {record.entity_label || 'General'} · {record.horizon_label || '30 days'}
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-5xl">{recordTitle}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">{recordSummary}</p>
            <div className="mt-4 space-y-1 text-sm leading-7 text-slate-600">
              {runDateSummary ? <p>{runDateSummary}</p> : null}
              <p>Published {formatPublicForecastDate(record.published_at || record.updatedAt)}</p>
              {relativeTimeSummary ? <p>{relativeTimeSummary}</p> : null}
            </div>
          </div>
          <div
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              state === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {state.replace(/_/g, ' ')}
          </div>
        </div>

        <LoadStatusNotice message={loadWarning} />

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {user ? <Bookmark className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {user ? (isSaved ? 'Saved to your library' : isSaving ? 'Saving...' : 'Save to your library') : 'Sign in to save'}
          </button>
          <button
            type="button"
            onClick={handleFollow}
            disabled={isFollowing}
            className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${
              user && isFollowed
                ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950'
            }`}
          >
            <Bell className="h-4 w-4" />
            {user ? (isFollowing ? 'Enabling updates...' : isFollowed ? 'Updates enabled' : 'Get updates if it changes') : 'Sign in to follow'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/forecast?q=${encodeURIComponent(record.query_text || record.query_origin || record.title)}`)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            <Sparkles className="h-4 w-4" />
            Ask your own forecast
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </section>

      <ResultStack
        items={items}
        isAuthenticated={Boolean(user)}
        isSaved={isSaved}
        isSaving={isSaving}
        isFollowed={isFollowed}
        isFollowing={isFollowing}
        onSave={handleSave}
        onFollow={handleFollow}
        onRemix={() => navigate(`/forecast?q=${encodeURIComponent(record.query_text || record.query_origin || record.title)}`)}
        onShare={() => void handleShare()}
        onLogin={onLogin}
      />

      {related.length > 0 ? (
        <DiscoverySection
          title="Related Forecasts"
          body="More public cards linked to the same entity or topic."
          records={related}
        />
      ) : null}
    </div>
  );
}
