export type Source = 'ga4' | 'gsc';
export type Scope = 'geral' | 'campinas' | 'ribeiraopreto' | 'tudoep';
export type Platform = 'web' | 'amp' | 'both';
export type Surface = 'web' | 'discover' | 'googleNews';
export type Grain = 'day' | 'week' | 'month' | 'hour';
export type DataState = 'final' | 'all';
export type Breakdown = { label: string; clicks?: number; impressions?: number; views?: number; value: number; ctr?: number | null; position?: number | null };
export type Ga4Segment = {
  label: string;
  /** Título da página informado pelo GA4 (pageTitle), quando disponível. */
  title?: string | null;
  views: number;
  sessions: number | null;
  engagedSessions: number | null;
  activeUsers: number | null;
  newUsers: number | null;
  engagementSeconds: number | null;
  engagementRate: number | null;
  engagementSecondsPerUser: number | null;
};
export type Ga4Event = { name: string; count: number };
export type Ga4Extra = {
  metrics: {
    totalUsers: number | null;
    newUsers: number | null;
    eventCount: number | null;
    scrolledUsers: number | null;
    engagementSeconds: number | null;
    averageSessionDuration: number | null;
    bounceRate: number | null;
    dauPerMau: number | null;
    wauPerMau: number | null;
    pagesPerSession: number | null;
    sessionsPerUser: number | null;
    viewsPerUser: number | null;
    engagementSecondsPerUser: number | null;
  };
  channelQuality: Ga4Segment[];
  sourceMedium: Ga4Segment[];
  contentQuality: Ga4Segment[];
  landingPages: Ga4Segment[];
  audience: Ga4Segment[];
  events: Ga4Event[];
  limitations: string[];
};
export type TrendRow = {
  period: string; clicks?: number; impressions?: number; ctr?: number | null; position?: number | null;
  views?: number; activeUsers?: number | null; sessions?: number; engagedSessions?: number; engagementRate?: number | null;
  newUsers?: number | null; engagementSeconds?: number | null; bounceRate?: number | null; eventCount?: number | null; pagesPerSession?: number | null;
};
export type DashboardData = {
  source: Source; scope: Scope; sourceLabel: string; description: string;
  granularity: Grain; start: string; endRequested: string; endAvailable: string | null;
  generatedAt: string; status: 'final' | 'preliminary';
  site?: string; propertyIds?: string[]; platform?: Platform; surface?: Surface;
  summary: TrendRow; series: TrendRow[]; devices: Breakdown[]; countries: Breakdown[];
  pages: Breakdown[]; queries: Breakdown[]; channels: Breakdown[];
  warnings: string[]; notes: string[]; ga4Extra?: Ga4Extra;
};
