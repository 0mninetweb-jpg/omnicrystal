import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AppShellState, DeviceTier, MotionMode } from '../types/appShell';

const PHONE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1279;

function getDeviceTier(width: number): DeviceTier {
  if (width <= PHONE_MAX_WIDTH) return 'phone';
  if (width <= TABLET_MAX_WIDTH) return 'tablet';
  return 'desktop';
}

function getTouchLike() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

function getMotionMode(deviceTier: DeviceTier, prefersReducedMotion: boolean, isTouchLike: boolean): MotionMode {
  if (prefersReducedMotion) return 'minimal';
  if (deviceTier === 'phone') return 'minimal';
  if (deviceTier === 'tablet' || isTouchLike) return 'reduced';
  return 'full';
}

function readShellState(): AppShellState {
  if (typeof window === 'undefined') {
    return {
      deviceTier: 'desktop',
      motionMode: 'full',
      isPhone: false,
      isTablet: false,
      isDesktop: true,
      isTouchLike: false,
    };
  }

  const deviceTier = getDeviceTier(window.innerWidth);
  const isTouchLike = getTouchLike();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionMode = getMotionMode(deviceTier, prefersReducedMotion, isTouchLike);

  return {
    deviceTier,
    motionMode,
    isPhone: deviceTier === 'phone',
    isTablet: deviceTier === 'tablet',
    isDesktop: deviceTier === 'desktop',
    isTouchLike,
  };
}

const defaultState = readShellState();

const AppShellContext = createContext<AppShellState>(defaultState);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppShellState>(defaultState);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sync = () => setState(readShellState());
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    sync();
    window.addEventListener('resize', sync);
    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', sync);
    }

    return () => {
      window.removeEventListener('resize', sync);
      if (typeof reducedMotionQuery.removeEventListener === 'function') {
        reducedMotionQuery.removeEventListener('change', sync);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.dataset.deviceTier = state.deviceTier;
    document.documentElement.dataset.motionMode = state.motionMode;

    return () => {
      delete document.documentElement.dataset.deviceTier;
      delete document.documentElement.dataset.motionMode;
    };
  }, [state.deviceTier, state.motionMode]);

  const value = useMemo(() => state, [state]);

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  return useContext(AppShellContext);
}
