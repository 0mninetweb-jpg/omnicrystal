import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';

const TrendChartInner = lazy(async () => ({
  default: (await import('./TrendChartInner')).TrendChartInner,
}));

export function DeferredTrendChart({ data }: { data: Array<{ value: number }> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || shouldRender) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '180px 0px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <div ref={containerRef} className="h-28 w-full md:h-32" style={{ minHeight: 112, minWidth: 0 }}>
      {shouldRender ? (
        <Suspense fallback={<div className="h-full w-full rounded-[18px] bg-white/5" />}>
          <TrendChartInner data={data} />
        </Suspense>
      ) : (
        <div className="h-full w-full rounded-[18px] bg-white/5" />
      )}
    </div>
  );
}
