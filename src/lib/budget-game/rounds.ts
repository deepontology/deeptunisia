/**
 * The five rounds of the citizen budget game.
 *
 * Each round a pressure hits the budget. The respondent answers with one of
 * three responses. A response moves money between lines in whole steps of 5%
 * of each line's draft (one step is 5% of the draft, so the final budget is a
 * valid allocation). Every response nets to zero in dinars, so the envelope
 * never changes and the budget stays balanced by construction.
 *
 * Stakes are consequences, not points: each response names what it does and
 * who pays. The consequence lines are illustrative and are not forecasts.
 * There is no score and no winner (SPEC section 1).
 *
 * Amounts are placeholders from lines.ts. Nothing here is the 2027 draft.
 */
import { MOVABLE, LOCKED } from './lines';
import type { LineId } from './copy';

/** A move in whole steps: positive adds to a line, negative cuts it. */
export interface Move {
	line: LineId;
	steps: number;
}

export interface Response {
	id: 'a' | 'b' | 'c';
	label: string;
	/** What the response pays for, in one line. */
	pays: string;
	/** Signed moves. Empty means the response changes nothing. */
	moves: Move[];
	/** Illustrative consequence, not a forecast. */
	consequence: string;
}

export interface Round {
	id: number;
	headline: string;
	body: string;
	/** Dinars the pressure asks for (placeholder). Positive asks for money, negative offers a saving. */
	amountMd: number;
	responses: [Response, Response, Response];
}

/** One step is this share of a line's draft. */
export const STEP_SHARE = 0.05;
export const MAX_STEPS = 20; // 0% to 200% of draft

const DRAFT: Record<string, number> = Object.fromEntries(
	[...MOVABLE, ...LOCKED].map((l) => [l.id, l.draft])
);

/** Dinars one step moves for a line (exact for the placeholder drafts). */
export function stepMd(line: LineId): number {
	return Math.round(DRAFT[line] * STEP_SHARE);
}

/** Net dinars of a response. Zero for every response by design. */
export function netMd(response: Response): number {
	return response.moves.reduce((sum, m) => sum + m.steps * stepMd(m.line), 0);
}

/** Dinars a response adds (positive moves only). */
export function addedMd(response: Response): number {
	return response.moves.reduce((sum, m) => sum + Math.max(0, m.steps) * stepMd(m.line), 0);
}

/** Dinars a response cuts (negative moves only), as a positive number. */
export function cutMd(response: Response): number {
	return response.moves.reduce((sum, m) => sum + Math.max(0, -m.steps) * stepMd(m.line), 0);
}

export const ROUNDS: Round[] = [
	{
		id: 1,
		headline: 'Fuel prices jump in spring',
		body: 'A jump in world prices hits the pump. Households ask the state to hold the subsidy. Holding it costs 250 MD this year.',
		amountMd: 250,
		responses: [
			{
				id: 'a',
				label: 'Fund the fuel subsidy in full',
				pays: 'Fuel subsidy, 250 MD',
				moves: [
					{ line: 'fuel', steps: 2 },
					{ line: 'roads', steps: -1 },
					{ line: 'universities', steps: -1 },
					{ line: 'other', steps: -1 }
				],
				consequence: 'Fewer road and housing projects this year. Pump prices hold.'
			},
			{
				id: 'b',
				label: 'Fund half and add food support',
				pays: 'Half the fuel subsidy and food support, 250 MD',
				moves: [
					{ line: 'fuel', steps: 1 },
					{ line: 'food', steps: 1 },
					{ line: 'other', steps: 1 },
					{ line: 'army', steps: -1 },
					{ line: 'police', steps: -1 },
					{ line: 'culture', steps: -1 }
				],
				consequence: 'Pump prices rise for most drivers. Basic food stays cheaper.'
			},
			{
				id: 'c',
				label: 'Let prices move',
				pays: 'Nothing. The budget stays as drafted.',
				moves: [],
				consequence: 'Household fuel costs rise this year. The budget does not change.'
			}
		]
	},
	{
		id: 2,
		headline: 'A hospital wave',
		body: 'Hospitals report staff shortages in several regions. The health line asks for 300 MD to hire.',
		amountMd: 300,
		responses: [
			{
				id: 'a',
				label: 'Staff the hospitals from schools and roads',
				pays: 'Hospital staffing, 300 MD',
				moves: [
					{ line: 'health', steps: 2 },
					{ line: 'schools', steps: -1 },
					{ line: 'roads', steps: -1 }
				],
				consequence: 'Fewer teachers added in the next intake. Fewer road repairs.'
			},
			{
				id: 'b',
				label: 'Staff the hospitals from offices and research',
				pays: 'Hospital staffing, 300 MD',
				moves: [
					{ line: 'health', steps: 2 },
					{ line: 'universities', steps: -1 },
					{ line: 'farming', steps: -1 },
					{ line: 'government', steps: -3 }
				],
				consequence: 'Government offices run with fewer staff. Farm support slows.'
			},
			{
				id: 'c',
				label: 'Defer to next year',
				pays: 'Nothing this year',
				moves: [],
				consequence: 'Patients wait longer for care this year.'
			}
		]
	},
	{
		id: 3,
		headline: 'A good harvest lowers food and fuel prices',
		body: 'Prices fall after a good harvest. The state could save 250 MD by cutting subsidies, and move the saving elsewhere.',
		amountMd: -250,
		responses: [
			{
				id: 'a',
				label: 'Cut fuel and move the saving to farming and roads',
				pays: 'Saves 250 MD from fuel',
				moves: [
					{ line: 'fuel', steps: -2 },
					{ line: 'farming', steps: 2 },
					{ line: 'roads', steps: 1 },
					{ line: 'culture', steps: 1 }
				],
				consequence: 'Fuel is no longer subsidised. Farm water and roads get the money.'
			},
			{
				id: 'b',
				label: 'Cut food and move the saving to health and roads',
				pays: 'Saves 250 MD from food and other',
				moves: [
					{ line: 'food', steps: -2 },
					{ line: 'other', steps: -2 },
					{ line: 'health', steps: 1 },
					{ line: 'roads', steps: 1 }
				],
				consequence: 'Basic food prices rise. Hospitals and roads get the money.'
			},
			{
				id: 'c',
				label: 'Keep the subsidies',
				pays: 'Nothing. The saving is not made.',
				moves: [],
				consequence: 'Subsidies stay where they are. Nothing moves.'
			}
		]
	},
	{
		id: 4,
		headline: 'The regions ask for local roads',
		body: 'Regional councils ask for 200 MD to repair local roads that were left out of earlier plans.',
		amountMd: 200,
		responses: [
			{
				id: 'a',
				label: 'Pay from government offices and culture',
				pays: 'Local roads, 200 MD',
				moves: [
					{ line: 'roads', steps: 2 },
					{ line: 'government', steps: -4 },
					{ line: 'culture', steps: -1 }
				],
				consequence: 'Central offices shrink. Local roads are repaired.'
			},
			{
				id: 'b',
				label: 'Pay from schools',
				pays: 'Local roads, 200 MD',
				moves: [
					{ line: 'roads', steps: 2 },
					{ line: 'schools', steps: -1 }
				],
				consequence: 'School repairs and classes are delayed. Local roads are repaired.'
			},
			{
				id: 'c',
				label: 'Pay from policing and small lines',
				pays: 'Local roads, 200 MD',
				moves: [
					{ line: 'roads', steps: 2 },
					{ line: 'police', steps: -1 },
					{ line: 'other', steps: -1 },
					{ line: 'youth', steps: -1 }
				],
				consequence: 'Fewer police stations refurbished. Youth centres wait.'
			}
		]
	},
	{
		id: 5,
		headline: 'A court orders compensation',
		body: 'A court orders 160 MD of compensation to former public workers. This is the last decision of the year.',
		amountMd: 160,
		responses: [
			{
				id: 'a',
				label: 'Pay from universities and energy',
				pays: 'Compensation, 160 MD',
				moves: [
					{ line: 'justice', steps: 4 },
					{ line: 'universities', steps: -1 },
					{ line: 'energy', steps: -1 }
				],
				consequence: 'Research grants slow. Energy firms get less state support.'
			},
			{
				id: 'b',
				label: 'Pay from farming and youth',
				pays: 'Compensation, 160 MD',
				moves: [
					{ line: 'justice', steps: 4 },
					{ line: 'farming', steps: -2 },
					{ line: 'youth', steps: -1 }
				],
				consequence: 'Farm support is cut for a season. Youth programmes shrink.'
			},
			{
				id: 'c',
				label: 'Pay from government, other and culture',
				pays: 'Compensation, 160 MD',
				moves: [
					{ line: 'justice', steps: 4 },
					{ line: 'government', steps: -2 },
					{ line: 'other', steps: -1 },
					{ line: 'culture', steps: -1 }
				],
				consequence: 'Central administration is thinner. Smaller programmes wait.'
			}
		]
	}
];
