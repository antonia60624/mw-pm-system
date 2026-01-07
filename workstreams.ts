export const WORKSTREAM_TITLES = ["兒少組", "研發組", "數位推廣組", "行政組"] as const;
export type WorkstreamTitle = (typeof WORKSTREAM_TITLES)[number];
