export interface TimelineEntry {
  id: string;
  /** Human step or batch id — timeline entries group under this. */
  threadId: string;
  message: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}
