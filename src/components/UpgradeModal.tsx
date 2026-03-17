import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Gem, Lock, Sparkles, X, Zap } from 'lucide-react';
import { cn } from './CrystalCard';
import { formatCredits, formatPrice, getPlanLabel, getWorldSimPlanTier, PLAN_OFFERS } from '../lib/crystalPlans';
import { PRODUCT_BRAND, WORLD_SIM_BRAND } from '../content/brand';
import type { BillingInterval, EntitlementSnapshot, PlanId, UpgradeIntent } from '../types/entitlements';

export function UpgradeModal({
  entitlements,
  intent,
  interval,
  isGuest,
  isLoading,
  checkoutError,
  onClose,
  onChangeInterval,
  onCheckout,
  onLogin,
}: {
  entitlements: EntitlementSnapshot;
  intent: UpgradeIntent | null;
  interval: BillingInterval;
  isGuest: boolean;
  isLoading: boolean;
  checkoutError: string | null;
  onClose: () => void;
  onChangeInterval: (interval: BillingInterval) => void;
  onCheckout: (plan: Exclude<PlanId, 'free'>, interval: BillingInterval) => Promise<void>;
  onLogin?: () => void;
}) {
  const recommendedPlan = intent?.recommendedPlan || 'plus';
  const plans: Exclude<PlanId, 'free'>[] = ['plus', 'pro'];

  return (
    <AnimatePresence>
      {intent && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            className="relative w-full max-w-5xl overflow-hidden rounded-[40px] border border-white/10 bg-[#050505] shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="absolute inset-0 premium-gradient opacity-10 pointer-events-none" />
            <div className="relative border-b border-white/10 p-8 md:p-10">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-3 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-sky-300">
                    <Gem className="h-4 w-4" />
                    {PRODUCT_BRAND.plansTitle}
                  </div>
                  <div>
                    <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-white">
                      {intent.title}
                    </h2>
                    <p className="mt-4 max-w-2xl text-base md:text-lg font-medium leading-relaxed text-slate-300">
                      {intent.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-400 transition-colors hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  Piano attuale: {isGuest ? 'Guest Preview' : getPlanLabel(entitlements.plan)}
                  {!isGuest && (
                    <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] uppercase tracking-wider text-sky-300">
                      {entitlements.creditsBalance} crediti
                    </span>
                  )}
                </div>

                <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1.5">
                  {(['month', 'year'] as BillingInterval[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onChangeInterval(value)}
                      className={cn(
                        'rounded-xl px-4 py-2 text-sm font-bold transition-all',
                        interval === value ? 'bg-white text-black shadow-xl' : 'text-slate-400 hover:text-white'
                      )}
                    >
                      {value === 'month' ? 'Mensile' : 'Annuale'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative grid grid-cols-1 gap-6 p-8 md:grid-cols-2 md:p-10">
              {plans.map((plan) => {
                const offer = PLAN_OFFERS[plan];
                const worldSimTier = getWorldSimPlanTier(plan);
                const isRecommended = recommendedPlan === plan;
                const isCurrent = entitlements.plan === plan;

                return (
                  <div
                    key={plan}
                    className={cn(
                      'rounded-[32px] border p-8 transition-all',
                      isRecommended
                        ? 'border-sky-500/40 bg-sky-500/10 shadow-[0_20px_80px_rgba(14,165,233,0.12)]'
                        : 'border-white/10 bg-white/5'
                    )}
                  >
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-3xl font-display font-bold text-white">{getPlanLabel(plan)}</h3>
                        <p className="mt-3 text-sm font-medium leading-relaxed text-slate-400">{offer.headline}</p>
                      </div>
                      {isRecommended && (
                        <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
                          Consigliato
                        </span>
                      )}
                    </div>

                    <div className="mb-6 flex items-end gap-3">
                      <span className="text-4xl font-display font-bold text-white">{formatPrice(plan, interval)}</span>
                      {interval === 'year' && (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                          Risparmi rispetto al mensile
                        </span>
                      )}
                    </div>

                    <div className="mb-8 space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white">
                        <Zap className="h-4 w-4 text-sky-400" />
                        {offer.creditsPerCycle} crediti / mese
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white">
                        <Lock className="h-4 w-4 text-sky-400" />
                        Watchlist fino a {offer.watchlistLimit}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white">
                        <Sparkles className="h-4 w-4 text-rose-300" />
                        WorldSim {worldSimTier.depthLabel} · {worldSimTier.agentCount} agenti
                      </div>
                    </div>

                    <div className="mb-8 space-y-3">
                      {offer.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3 text-sm font-medium text-slate-300">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          <span>{feature}</span>
                        </div>
                      ))}
                      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">
                        {WORLD_SIM_BRAND.name} fa parte di ogni piano. Cambiano risoluzione, coda e profondita: {worldSimTier.monthlyRunsLabel}, {worldSimTier.queueLabel.toLowerCase()}.
                      </div>
                    </div>

                    {isGuest ? (
                      <button
                        type="button"
                        onClick={onLogin}
                        className="w-full rounded-2xl bg-white px-6 py-4 text-sm font-bold text-black transition-colors hover:bg-slate-100"
                      >
                        Accedi gratis
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isLoading || isCurrent}
                        onClick={() => onCheckout(plan, interval)}
                        className={cn(
                          'w-full rounded-2xl px-6 py-4 text-sm font-bold transition-all',
                          isCurrent
                            ? 'cursor-default border border-white/10 bg-white/5 text-slate-500'
                            : isRecommended
                              ? 'bg-white text-black hover:bg-slate-100'
                              : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
                        )}
                      >
                        {isCurrent ? 'Piano attuale' : `Passa a ${getPlanLabel(plan)}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="relative border-t border-white/10 px-8 py-6 text-sm font-medium text-slate-400 md:px-10">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <span>
                  Le azioni premium consumano crediti solo se la generazione va a buon fine. Esempi: Forecast standard {formatCredits(1)}, Nextletter personal {formatCredits(3)}.
                </span>
                {checkoutError && <span className="font-bold text-rose-300">{checkoutError}</span>}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
