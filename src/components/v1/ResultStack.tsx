import React from 'react';
import type { ForecastStackItem } from '../../types/forecastV1';
import { PredictionCard } from './PredictionCard';
import { LimitedCard } from './LimitedCard';
import { CoverageGapCard } from './CoverageGapCard';
import { ScenarioCard } from './ScenarioCard';
import { DriversWatchCard } from './DriversWatchCard';
import { ActionCard } from './ActionCard';

type ResultStackProps = {
  items: ForecastStackItem[];
  isAuthenticated: boolean;
  isSaved: boolean;
  isSaving: boolean;
  isFollowed: boolean;
  isFollowing: boolean;
  onSave: () => void;
  onFollow: () => void;
  onRemix: () => void;
  onShare: () => void;
  onLogin: () => void;
};

export function ResultStack({
  items,
  isAuthenticated,
  isSaved,
  isSaving,
  isFollowed,
  isFollowing,
  onSave,
  onFollow,
  onRemix,
  onShare,
  onLogin,
}: ResultStackProps) {
  return (
    <div className="space-y-5">
      {items.map((item) => {
        if (item.kind === 'primary') {
          if (item.state === 'limited') {
            return <LimitedCard key={item.id} item={item} onRemix={onRemix} />;
          }
          return (
            <PredictionCard
              key={item.id}
              item={item}
              isSaved={isSaved}
              isSaving={isSaving}
              isFollowed={isFollowed}
              isFollowing={isFollowing}
              onSave={onSave}
              onFollow={onFollow}
              onRemix={onRemix}
              onShare={onShare}
            />
          );
        }

        if (item.kind === 'coverage') {
          return (
            <CoverageGapCard
              key={item.id}
              item={item}
              isAuthenticated={isAuthenticated}
              isFollowing={isFollowing}
              onFollow={onFollow}
              onRemix={onRemix}
              onLogin={onLogin}
            />
          );
        }

        if (item.kind === 'scenario') {
          return <ScenarioCard key={item.id} item={item} />;
        }

        if (item.kind === 'drivers_watch') {
          return <DriversWatchCard key={item.id} item={item} />;
        }

        return <ActionCard key={item.id} item={item} />;
      })}
    </div>
  );
}
