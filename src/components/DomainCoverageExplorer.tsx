import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Database, Globe2, Lock, Radar } from 'lucide-react';
import { BLUEPRINT_STATIC_DOMAINS } from '../data/domains';
import { getCatalogRegistry, getCoverageSnapshot, getSourceRegistry } from '../services/geminiService';
import type { CatalogRegistryPayload, CoverageSnapshot, RegistryDomain, SourceRegistryPayload } from '../types/registry';
import { cn } from './CrystalCard';

type DomainCoverageExplorerProps = {
  variant?: 'full' | 'compact';
  title?: string;
  description?: string;
};

const BLOCK_ORDER = ['A', 'B', 'C'] as const;

const STATIC_CATALOG: CatalogRegistryPayload = {
  catalog_version_id: 'crystal-b2c-blueprint-v1.2',
  policy_profile: 'public-only',
  domains: BLUEPRINT_STATIC_DOMAINS.map((domain) => ({
    ...domain,
    summary: '',
    allowed_card_types: [],
    supported_horizons: [],
    source_registry: [],
  })),
};

function getStateTone(state?: RegistryDomain['current_state']) {
  if (state === 'published') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'limited') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function getStateLabel(state?: RegistryDomain['current_state']) {
  if (state === 'published') return 'Published';
  if (state === 'limited') return 'Limited';
  return 'Blocked';
}

function getStateIcon(state?: RegistryDomain['current_state']) {
  if (state === 'published') return <Check className="h-4 w-4" />;
  if (state === 'limited') return <AlertTriangle className="h-4 w-4" />;
  return <Lock className="h-4 w-4" />;
}

function getBlockLabel(block: string) {
  if (block === 'A') return 'Macro Areas';
  if (block === 'B') return 'Personal Outcomes';
  if (block === 'C') return 'Fun Pack';
  return 'System';
}

function fallbackCoverageSnapshot(): CoverageSnapshot {
  const totals = BLUEPRINT_STATIC_DOMAINS.reduce(
    (accumulator, domain) => {
      accumulator.domains += 1;
      if (domain.current_state === 'published') accumulator.published_domains += 1;
      else if (domain.current_state === 'limited') accumulator.limited_domains += 1;
      else accumulator.blocked_domains += 1;
      return accumulator;
    },
    {
      coverage_units: BLUEPRINT_STATIC_DOMAINS.length,
      domains: 0,
      published_domains: 0,
      limited_domains: 0,
      blocked_domains: 0,
    }
  );

  return {
    catalog_version_id: STATIC_CATALOG.catalog_version_id,
    policy_profile: STATIC_CATALOG.policy_profile,
    totals,
    scores: {
      coverage_score: Number((totals.published_domains / Math.max(totals.domains, 1)).toFixed(3)),
      depth_score: 0,
      freshness_score: 0,
    },
    availability: {
      available: totals.published_domains,
      limited: totals.limited_domains,
      blocked: totals.blocked_domains,
    },
  };
}

export function DomainCoverageExplorer({
  variant = 'full',
  title = 'Blueprint coverage explorer',
  description = 'Crystal now carries the full blueprint catalog. What changes is the honesty of publication: every domain is marked as published, limited, or blocked based on real evidence coverage.',
}: DomainCoverageExplorerProps) {
  const [catalog, setCatalog] = useState<CatalogRegistryPayload>(STATIC_CATALOG);
  const [coverage, setCoverage] = useState<CoverageSnapshot>(fallbackCoverageSnapshot());
  const [sourceRegistry, setSourceRegistry] = useState<SourceRegistryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [catalogPayload, coveragePayload, sourcePayload] = await Promise.all([
          getCatalogRegistry(),
          getCoverageSnapshot(),
          getSourceRegistry(),
        ]);

        if (!active) return;

        if (catalogPayload?.domains) {
          setCatalog(catalogPayload);
        }
        if (coveragePayload?.totals) {
          setCoverage(coveragePayload);
        }
        if (sourcePayload?.approved_sources) {
          setSourceRegistry(sourcePayload);
        }
        setLoadError(null);
      } catch (_error) {
        if (!active) return;
        setCatalog(STATIC_CATALOG);
        setCoverage(fallbackCoverageSnapshot());
        setLoadError('Live registry not reachable. Showing the local blueprint catalog snapshot.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const groupedDomains = useMemo(() => {
    const filtered = catalog.domains.filter((domain) => domain.block !== 'system');
    return BLOCK_ORDER.map((block) => ({
      block,
      label: getBlockLabel(block),
      domains: filtered.filter((domain) => domain.block === block),
    }));
  }, [catalog.domains]);

  const sourceCount = sourceRegistry?.approved_sources?.length || 0;
  const candidateCount = sourceRegistry?.candidate_paid_or_restricted_sources?.length || 0;
  const domainsPerBlock = variant === 'compact' ? 4 : undefined;

  return (
    <section className="editorial-panel content-auto rounded-[32px] p-6 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <div className="section-kicker">Catalog + Coverage</div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">{title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
          <div className="font-semibold text-slate-950">{catalog.catalog_version_id}</div>
          <div className="mt-1 capitalize">{catalog.policy_profile}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <div className="section-kicker !text-slate-500">Domains</div>
          <div className="mt-2 text-2xl font-display font-semibold text-slate-950">{coverage.totals.domains}</div>
          <div className="mt-2 text-sm text-slate-600">{coverage.totals.published_domains} published right now</div>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <div className="section-kicker !text-slate-500">Coverage units</div>
          <div className="mt-2 text-2xl font-display font-semibold text-slate-950">{coverage.totals.coverage_units}</div>
          <div className="mt-2 text-sm text-slate-600">{Math.round(coverage.scores.coverage_score * 100)}% core published</div>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <div className="section-kicker !text-slate-500">Source registry</div>
          <div className="mt-2 text-2xl font-display font-semibold text-slate-950">{sourceCount || '...'}</div>
          <div className="mt-2 text-sm text-slate-600">
            {candidateCount > 0 ? `${candidateCount} paid or restricted candidates held out of the core path` : 'Public-only policy active'}
          </div>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <div className="section-kicker !text-slate-500">Publication states</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              {coverage.totals.published_domains} published
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
              {coverage.totals.limited_domains} limited
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700">
              {coverage.totals.blocked_domains} blocked
            </span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
          {loadError}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {groupedDomains.map(({ block, label, domains }) => {
          const visibleDomains = typeof domainsPerBlock === 'number' ? domains.slice(0, domainsPerBlock) : domains;
          const hiddenCount = Math.max(domains.length - visibleDomains.length, 0);

          return (
            <div key={block} className="rounded-[28px] border border-slate-200 bg-[rgba(255,255,255,0.82)] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="section-kicker">{label}</div>
                  <div className="mt-2 text-lg font-display font-semibold text-slate-950">
                    Block {block} · {domains.length} domains in catalog
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                    {domains.filter((domain) => domain.current_state === 'published').length} published
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                    {domains.filter((domain) => domain.current_state === 'limited').length} limited
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                    {domains.filter((domain) => domain.current_state === 'blocked').length} blocked
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {visibleDomains.map((domain) => (
                  <article key={domain.domain_id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {domain.macro_area_id}
                        </div>
                        <h4 className="mt-2 text-lg font-semibold text-slate-950">{domain.title}</h4>
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold', getStateTone(domain.current_state))}>
                        {getStateIcon(domain.current_state)}
                        {getStateLabel(domain.current_state)}
                      </span>
                    </div>

                    {domain.summary && <p className="mt-3 text-sm leading-7 text-slate-600">{domain.summary}</p>}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                        {domain.target_wave?.replace('_', ' ') || 'wave pending'}
                      </span>
                      {(domain.supported_horizons || []).slice(0, 3).map((horizon) => (
                        <span key={`${domain.domain_id}-${horizon}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                          {horizon}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-[18px] border border-slate-200 bg-[#fcfbf8] px-3 py-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          <Globe2 className="h-3.5 w-3.5 text-[#1453e8]" />
                          Card types
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-700">
                          {(domain.allowed_card_types || []).length > 0
                            ? (domain.allowed_card_types || []).slice(0, 2).join(', ').replace(/_/g, ' ')
                            : 'Coverage shell only'}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-[#fcfbf8] px-3 py-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          <Database className="h-3.5 w-3.5 text-[#1453e8]" />
                          Sources
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-700">
                          {(domain.source_registry || []).length > 0
                            ? (domain.source_registry || []).slice(0, 2).map((source) => source.title).join(', ')
                            : 'Registry only'}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {hiddenCount > 0 && (
                <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Compact view is showing the first {visibleDomains.length} domains in block {block}. {hiddenCount} more remain in the live catalog.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isLoading && (
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-500">
          <Radar className="h-4 w-4 animate-pulse text-[#1453e8]" />
          Refreshing live registry and coverage state...
        </div>
      )}
    </section>
  );
}
