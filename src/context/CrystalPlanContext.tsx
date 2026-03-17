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
import { PLAN_COPY, PRODUCT_BRAND, WORLD_SIM_BRAND } from '../content/brand';
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
    title: PLAN_COPY.defaultUpgradeTitle,
    description: PLAN_COPY.defaultUpgradeDescription,
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
        setCheckoutError(error instanceof Error ? error.message : PLAN_COPY.checkoutError);
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
          title: PLAN_COPY.loginTitle,
          description: PLAN_COPY.loginDescription,
          recommendedPlan: 'plus',
          action: spec.action,
          sourceView: options?.sourceView,
        });
        throw new Error('You need to sign in to use this feature.');
      }

      if (spec.requiredPlan !== 'free' && !isPlanAtLeast(entitlements.plan, spec.requiredPlan)) {
        openUpgrade({
          reason: 'feature',
          title: `${getPlanLabel(spec.requiredPlan)} unlocks this level of depth`,
          description:
            spec.requiredPlan === 'pro'
              ? `${WORLD_SIM_BRAND.name} and deeper forecasts are part of Pro.`
              : 'Plus unlocks medium horizons and steadier product usage.',
          recommendedPlan: spec.requiredPlan,
          action: spec.action,
          sourceView: options?.sourceView,
        });
        throw new Error('This feature requires a higher plan.');
      }

      if (entitlements.creditsBalance < spec.cost) {
        openUpgrade({
          reason: 'credits',
          title: 'You are out of credits',
          description:
            options?.insufficientCreditsMessage ||
            `You need ${spec.cost} credits for this action. Move to Plus or Pro to keep going without interruptions.`,
          recommendedPlan: getRecommendedPlanForAction(spec.action),
          action: spec.action,
          sourceView: options?.sourceView,
        });
        throw new Error('Not enough credits.');
      }

      try {
        return await withServerRequestContext({ sourceView: options?.sourceView, meteredAction: spec.action }, fn);
      } catch (error) {
        const code = getErrorCode(error);
        if (code === 'plan-upgrade-required' || code === 'oracle-plan-required') {
          openUpgrade({
            reason: 'feature',
            title: 'This forecast needs a higher plan',
            description: error instanceof Error ? error.message : 'Unlock this feature with an upgrade.',
            recommendedPlan: getRecommendedPlanForAction(spec.action),
            action: spec.action,
            sourceView: options?.sourceView,
          });
        }
        if (code === 'credits-exhausted') {
          openUpgrade({
            reason: 'credits',
            title: 'You have used the credits for this cycle',
            description: error instanceof Error ? error.message : 'Move to a higher plan to keep going.',
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
