import { auth } from '../firebase';
import type { BillingInterval, PlanId } from '../types/entitlements';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function billingRequest<T>(path: string, body: Record<string, unknown>) {
  if (!auth.currentUser) {
    throw new Error('Devi accedere per gestire il tuo piano.');
  }

  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  }

  return payload as T;
}

export async function createCheckoutSession(plan: Exclude<PlanId, 'free'>, interval: BillingInterval) {
  return billingRequest<{ url: string }>('billing/create-checkout-session', {
    plan,
    interval,
    returnUrl: window.location.href,
  });
}
