/**
 * The single switch that opens the Agora — and the mode the interface reports.
 *
 * THE SERVER IS THE BOUNDARY. This module decides what the *client* believes:
 * whether the Agora tab shows a coming-soon banner or the live client, whether
 * the Discuss and Propose doors are links or marks. It cannot open the API. If a
 * build compiled with `beta` points at a server running `off`, every request it
 * makes gets the uniform 404, because community/mode.ts is enforced in the
 * handler before any database access. Runtime configuration is authoritative;
 * this value is a display and routing input only.
 *
 * The value is read at build time from VITE_COMMUNITY_MODE:
 *
 *   unset or anything unrecognised → off  (the closed state)
 *   read-only                      → the closed state: the client has no
 *                                    read-only UI, and the banner is honest
 *                                    about what a reader can do
 *   beta                           → the live client
 *
 * `npm start` sets VITE_COMMUNITY_MODE=beta for the dev loop alongside the local
 * server's COMMUNITY_MODE, so the two halves of development agree. A production
 * build is given neither unless it deliberately wants them, and
 * scripts/verify-deploy.cjs fails a deployment whose client mode and server mode
 * disagree — that mismatch is the defect this arrangement exists to prevent.
 *
 * To work on the Agora, start the dev server: `npm start` opens both halves.
 * Setting it back to `false` is no longer a code edit.
 */
export type CommunityMode = 'off' | 'read-only' | 'beta';

/** The same acceptance rule the server uses: anything unrecognised is `off`. */
function resolveClientMode(raw: unknown): CommunityMode {
	return raw === 'read-only' || raw === 'beta' ? raw : 'off';
}

/** What this build was compiled to believe about the community API. */
export const COMMUNITY_MODE: CommunityMode = resolveClientMode(
	import.meta.env.VITE_COMMUNITY_MODE
);

/** Display only: render the live Agora client instead of the closed banner. */
export const AGORA_OPEN = COMMUNITY_MODE === 'beta';
