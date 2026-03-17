export type DeviceTier = 'phone' | 'tablet' | 'desktop';
export type MotionMode = 'full' | 'reduced' | 'minimal';

export interface AppShellState {
  deviceTier: DeviceTier;
  motionMode: MotionMode;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchLike: boolean;
}
