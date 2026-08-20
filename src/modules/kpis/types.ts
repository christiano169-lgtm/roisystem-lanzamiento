export interface KpiFilters {
  from?: Date;
  to?: Date;
  ownerGhlId?: string;
  tagNames?: string[];
}

export interface OperationalKpis {
  leadsGenerados: number;
  llamadas: number;
  contestadas: number;
  tasaContestacionPct: number;
  tiempoAlLeadMinutosPromedio: number | null;
  intentosPromedio: number | null;
  agendadas: number;
  asistidas: number;
  ingresos: number;
  efectivoCobrado: number;
  ticketPromedio: number;
  wonCount: number;
  ofertadaCount: number;
  noOfertadaCount: number;
}

export interface MultiLocationOperationalKpis {
  totals: OperationalKpis;
  byLocation: Array<{ locationId: string; locationName: string; kpis: OperationalKpis }>;
}

export interface FunnelStage {
  pipelineStageId: string | null;
  pipelineName: string;
  stageName: string;
  count: number;
  percentageOfTotalPct: number;
}

export interface AdvisorRankingRow {
  ownerGhlId: string;
  name: string;
  leads: number;
  llamadas: number;
  contestadas: number;
  tiempoAlLeadMinutosPromedio: number | null;
  agendadas: number;
  asistidas: number;
  facturacion: number;
  efectivoCobrado: number;
  tasaAgendamientoPct: number;
}

export interface AcquisitionRow {
  source: string;
  leads: number;
  llamados: number;
  contestaron: number;
  agendaron: number;
  asistieron: number;
  facturacion: number;
  tasaContactoPct: number;
  tasaAgendamientoPct: number;
  tasaAsistenciaPct: number;
  tasaCierrePct: number;
}
