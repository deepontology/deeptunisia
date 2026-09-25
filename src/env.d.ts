/**
 * Vite's build-time environment typings.
 *
 * The only value the interface reads from here is VITE_COMMUNITY_MODE, in
 * $lib/agora-gate.ts. It is a display input, never a server control: see that
 * file for why the boundary is on the server.
 */
/// <reference types="vite/client" />
