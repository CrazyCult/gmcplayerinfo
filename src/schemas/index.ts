import { z } from "zod";

/** Catalogues also include older Companion snapshots with incomplete attributes. */
export const playerSummarySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  position: z.string().catch("?"),
  age: z.number().int().min(10).max(60),
  overall: z.number().int().min(1).max(150),
  potential: z.number().int().min(1).max(150),
});
export type PlayerSummary = z.infer<typeof playerSummarySchema>;
