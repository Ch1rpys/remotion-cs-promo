import beats from "../data/beats.json";

export const CUTS = beats.cuts as { hardware: number[]; future: number[]; courses: number[]; photos: number[] };
export const ACCEPTED = beats.accepted as number;
