import { useEffect, useState } from 'react';
import { apiGet } from './api';

export interface ActiveLaunch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'closed';
}

/**
 * The floating assistant/report widgets are global (mounted in AppLayout,
 * not scoped to whichever page/launch the user has selected there) but
 * still have to follow the "always filter by launch" rule — so they resolve
 * their own launch: prefer one marked `active`, otherwise the most
 * recently started one. Returns null while loading or if none exist yet.
 */
export function useActiveLaunch(locationId: string): ActiveLaunch | null {
  const [launch, setLaunch] = useState<ActiveLaunch | null>(null);

  useEffect(() => {
    if (!locationId) {
      setLaunch(null);
      return;
    }
    let cancelled = false;
    apiGet<{ launches: ActiveLaunch[] }>(`/api/launches?locationId=${locationId}`).then((res) => {
      if (cancelled) return;
      const active = res.launches.find((l) => l.status === 'active');
      setLaunch(active ?? res.launches[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return launch;
}
