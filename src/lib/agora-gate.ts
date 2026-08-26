/**
 * The single switch that opens the Agora.
 *
 * The discussion layer is implemented and staged, but it is not open to the
 * public yet. Everything that advertises or renders it reads this one flag:
 *
 *   - the switcher badge on the Agora bubble (nav.svelte.ts / MenuBar.svelte)
 *   - the /agora page itself: a coming-soon banner when closed, the full
 *     client (threads, proposals, identity, moderation) when open
 *   - the Discuss / Propose a change doors on every card and connection
 *
 * To work on the Agora, set this to `true` and start the dev server. Nothing
 * else needs to change: the badge disappears, the doors become live links and
 * /agora renders the real client against the community API. Set it back to
 * `false` to close the section again.
 */
export const AGORA_OPEN = false;
