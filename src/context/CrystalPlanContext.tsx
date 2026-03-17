import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  canUseFeature as canUseFeatureByPlan,
  createDefaultEntitlementFields,
  DEFAULT_PLAN,
  getPlanLabel,
  getRecommendedPlanForAction,
  isPlanAtLeast,
  normalizeEntitlements,
} from '../lib/crystalPlans';
import { createCheckoutSession } from '../services/billingService';
import { withServerRequestContext } from '../services/geminiService';
import type {
  BillingInterval,
  CrystalFeature,
  EntitlementSnapshot,
  MeteredActionSpec,
  PlanId,
  UpgradeIntent,
} from '../types/entitlements';
import { UpgradeModal } from '../components/UpgradeModal';

type CrystalPlanContextValue = {
  entitlements: EntitlementSnapshot;
  isEntitlementsReady: boolean;
  isGuest: boolean;
  checkoutError: string | null;
  isCheckingOut: boolean;
  openUpgrade: (intent?: Partial<UpgradeIntent>) => void;
  closeUpgrade: () => void;
  startCheckout: (plan: Exclude<PlanId, 'free'>, interval?: BillingInterval) => Promise<void>;
  canUseFeature: (feature: CrystalFeature) => boolean;
  runMeteredAction: <T>(
    spec: MeteredActionSpec,
    fn: () => Promise<T>,
    options?: {
      sourceView?: string;
      insufficientCreditsMessage?: string;
    }
  ) => Promise<T>;
};

const defaultEntitlements = normalizeEntitlements(createDefaultEntitlementFields(DEFAULT_PLAN));

const CrystalPlanContext = createContext<CrystalPlanContextValue | null>(null);

function getDefaultUpgradeIntent(): UpgradeIntent {
  return {
    reason: 'feature',
    title: 'Sblocca il prossimo livello di Crystal',
    description: 'Più crediti, più profondità e la modalità Oracle per le previsioni ad alto impatto.',
    recommendedPlan: 'plus',
  };
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
}

export function CrystalPlanProvider({
  children,
  user,
  isGuest,
  onLogin,
}: {
  children: React.ReactNode;
  user: any;
  isGuest: boolean;
  onLogin?: () => void;
}) {
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot>(defaultEntitlements);
  const [isEntitlementsReady, setIsEntitlementsReady] = useState(false);
  const [upgradeIntent, setUpgradeIntent] = useState<UpgradeIntent | null>(null);
  const [checkoutInterval, setCheckoutInterval] = useState<BillingInterval>('month');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setEntitlements(defaultEntitlements);
      setIsEntitlementsReady(true);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setEntitlements(normalizeEntitlements(snapshot.data() as Record<string, unknown> | undefined));
        setIsEntitlementsReady(true);
      },
      () => {
        setEntitlements(defaultEntitlements);
        setIsEntitlementsReady(true);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const openUpgrade = useCallback((intent?: Partial<UpgradeIntent>) => {
    setCheckoutError(null);
    setUpgradeIntent({
      ...getDefaultUpgradeIntent(),
      ...intent,
    });
  }, []);

  const closeUpgrade = useCallback(() => {
    setCheckoutError(null);
    setUpgradeIntent(null);
  }, []);

  const startCheckout = useCallback(
    async (plan: Exclude<PlanId, 'free'>, interval: BillingInterval = checkoutInterval) => {
      if (!user) {
        closeUpgrade();
        onLogin?.();
        return;
      }

      setCheckoutError(null);
      setIsCheckingOut(true);
      try {
        const session = await createCheckoutSession(plan, interval);
        window.location.href = session.url;
      } catch (error) {
        setCheckoutError(error instanceof Error ? error.message : 'Impossibile aprire il checkout.');
      } finally {
        setIsCheckingOut(false);
      }
    },
    [checkoutInterval, closeUpgrade, onLogin, user]
  );

  const canUseFeature = useCallback(
    (feature: CrystalFeature) => canUseFeatureByPlan(entitlements.plan, feature),
    [entitlements.plan]
  );

  const runMeteredAction = useCallback(
    async <T,>(
      spec: MeteredActionSpec,
      fn: () => Promise<T>,
      options?: { sourceView?: string; insufficientCreditsMessage?: string }
    ) => {
      if (!user) {
        openUpgrade({
          reason: 'login',
          title: 'Accedi per sbloccare Crystal',
          description: 'Crea un account gratuito per usare crediti, watchlist e previsioni personalizzate.',
          recommendedPlan: 'plus',
          action: spec.action,
          sourceView: options?.sourceView,
        });
        throw new Error('Devi accedere per usare questa funzione.');
      }

      if (spec.requiredPlan !== 'free' && !isPlanAtLeast(entitlements.plan, spec.requiredPlan)) {
        openUpgrade({
          reason: 'feature',
          title: `${getPlanLabel(spec.requiredPlan)} sblocca questa profondita`,
          description:
            spec.requiredPlan === 'pro'
              ? 'La modalita Oracle usa TimeGPT e i filtri Pro del blueprint.'
              : 'Plus sblocca gli orizzonti medi e un uso piu continuo di Crystal.',
          recommendedPlan: spec.requiredPlan,
          action: spec.action,
          sourceView: options?.sourceView,
        });
        throw new Error('Questa funzione richiede un piano superiore.');
      }

      if (entitlements.creditsBalance < spec.cost) {
        openUpgrade({
          reason: 'credits',
          title: 'Crediti terminati',
          description:
            options?.insufficientCreditsMessage ||
            `Ti servono ${spec.cost} crediti per questa azione. Passa a Plus o Pro per continuare senza interruzioni.`,
          recommendedPlan: getRecommendedPlanForAction(spec.action),
          action: spec.action,
          sourceView: options?.sourceView,
        });
        throw new Error('Crediti insufficienti.');
      }

      try {
        return await withServerRequestContext(
          { sourceView: options?.sourceView, meteredAction: spec.action },
          fn
        );
      } catch (error) {
        const code = getErrorCode(error);
        if (code === 'plan-upgrade-required' || code === 'oracle-plan-required') {
          openUpgrade({
            reason: 'feature',
            title: 'Questa previsione richiede un piano superiore',
            description: error instanceof Error ? error.message : 'Sblocca questa funzionalita con un upgrade.',
            recommendedPlan: getRecommendedPlanForAction(spec.action),
            action: spec.action,
            sourceView: options?.sourceView,
          });
        }
        if (code === 'credits-exhausted') {
          openUpgrade({
            reason: 'credits',
            title: 'Hai finito i crediti del ciclo',
            description: error instanceof Error ? error.message : 'Passa a un piano superiore per continuare.',
            recommendedPlan: getRecommendedPlanForAction(spec.action),
            action: spec.action,
            sourceView: options?.sourceView,
          });
        }
        throw error;
      }
    },
    [entitlements.creditsBalance, entitlements.plan, openUpgrade, user]
  );

  const value = useMemo<CrystalPlanContextValue>(
    () => ({
      entitlements,
      isEntitlementsReady,
      isGuest,
      checkoutError,
      isCheckingOut,
      openUpgrade,
      closeUpgrade,
      startCheckout,
      canUseFeature,
      runMeteredAction,
    }),
    [
      canUseFeature,
      checkoutError,
      closeUpgrade,
      entitlements,
      isCheckingOut,
      isEntitlementsReady,
      isGuest,
      openUpgrade,
      runMeteredAction,
      startCheckout,
    ]
  );

  return (
    <CrystalPlanContext.Provider value={value}>
      {children}
      <UpgradeModal
        entitlements={entitlements}
        intent={upgradeIntent}
        interval={checkoutInterval}
        isGuest={isGuest}
        isLoading={isCheckingOut}
        checkoutError={checkoutError}
        onClose={closeUpgrade}
        onChangeInterval={setCheckoutInterval}
        onCheckout={startCheckout}
        onLogin={onLogin}
      />
    </CrystalPlanContext.Provider>
  );
}

export function useCrystalPlan() {
  const context = useContext(CrystalPlanContext);
  if (!context) {
    throw new Error('useCrystalPlan must be used within CrystalPlanProvider.');
  }
  return context;
}
