import type { BillingInterval, PlanId } from '../types/entitlements';
import { invokeCrystalApi } from '../platform/appwriteFunctionApi';

async function billingRequest<T>(path: string, body: Record<string, unknown>) {
  return invokeCrystalApi<T>(path, {
    method: 'POST',
    body,
    requireAuth: true,
  });
}

export async function createCheckoutSession(plan: Exclude<PlanId, 'free'>, interval: BillingInterval) {
  return billingRequest<{ url: string }>('billing/create-checkout-session', {
    plan,
    interval,
    returnUrl: window.location.href,
  });
}
