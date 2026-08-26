// Fully static: no server, no database, no API. The whole dataset is a few
// hundred kilobytes of JSON shipped with the page, which is what makes timeline
// scrubbing feel instant and leaves nothing to compromise.
export const prerender = true;
export const ssr = true;
