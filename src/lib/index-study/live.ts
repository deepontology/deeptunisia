/**
 * The shape `GET /api/studies/:slug/live` returns (community/research-api.ts).
 * Aggregates only: the endpoint never returns a row, a receipt or a timestamp
 * finer than an hour.
 */
import type { SeriesAggregate, WaveAggregate } from '../../../community/research-scoring.ts';

export interface LiveResults {
	study: string;
	instrument: { id: string; version: string; hash: string };
	generated_at: string;
	/** Every stored row for this instrument, before exclusions. */
	received: number;
	exclusions: { rows_excluded: number; rules: Record<string, number> };
	/** Hourly submission counts for the last 72 hours, excluded rows included. */
	submissions_per_hour: { start: string; counts: number[] };
	/** Every response this instrument has kept, all months together. */
	results: WaveAggregate;
	/** The monthly index, oldest month first; null for an instrument without a series. */
	series: SeriesAggregate | null;
}
