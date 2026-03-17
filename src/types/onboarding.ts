export const ONBOARDING_STORAGE_KEY = 'crystal-onboarding-v1';

export type OnboardingChecklistKey = 'firstForecast' | 'firstWatchlist' | 'openedBriefing';

export interface OnboardingState {
  hasSeenIntro: boolean;
  completedChecklist: Record<OnboardingChecklistKey, boolean>;
  dismissedAt: string | null;
}

export const defaultOnboardingState: OnboardingState = {
  hasSeenIntro: false,
  completedChecklist: {
    firstForecast: false,
    firstWatchlist: false,
    openedBriefing: false,
  },
  dismissedAt: null,
};
