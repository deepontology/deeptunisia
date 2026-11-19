/**
 * YAML patch emitter, the write path for the admin panel.
 *
 * The splicer is owned by the engine (pinned by commit in package.json) and
 * reached through the one engine instance in scripts/engine.ts. This file keeps
 * the exported names every importer uses: applyEdit delegates to
 * engine.splicer.applyEdit, and the guard, the error class and the types are
 * the engine's own, so an instanceof check anywhere in this tree still sees
 * the class the engine throws.
 *
 * The property the splicer exists to keep: an edit changes exactly one
 * contiguous region of the file, and nothing else moves. The guard is semantic,
 * not textual, and it runs inside the engine's applyEdit, so a scattered or
 * reordering change cannot reach disk through this path even by a bug here.
 */
import {
	EmitError,
	type Edit,
	type EmitResult,
	type Records,
	type Splice,
	type Target
} from 'deepepisteme/kernel';
import { engine } from './engine.ts';

export { EmitError };
export type { Edit, EmitResult, Records, Splice, Target };

/**
 * Apply one edit. Returns the new file text and the region that changed.
 * Schema validation is the caller's job (it needs the whole file set to check
 * cross-file references), but a file that no longer parses never reaches disk.
 */
export function applyEdit(source: string, edit: Edit): EmitResult {
	return engine.splicer.applyEdit(source, edit);
}

/**
 * Verify that no record except the target came out different. Exported for the
 * tests and the editorial tool, which assert on the guard directly.
 */
export function assertOnlyTargetChanged(
	before: string | Records,
	after: string | Records,
	targetId: string | null
): void {
	engine.splicer.assertOnlyTargetChanged(before, after, targetId);
}
