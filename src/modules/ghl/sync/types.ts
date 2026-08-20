export interface SyncPageResult {
  recordsSynced: number;
  /** Opaque cursor to resume from; null/undefined means "no more pages". */
  nextCursor?: string | null;
}

export interface EntitySyncer {
  /** Fetches + upserts a single page of an entity for a location. */
  syncPage(tenantId: string, locationId: string, ghlLocationId: string, cursor: string | null): Promise<SyncPageResult>;
}
