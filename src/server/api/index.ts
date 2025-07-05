import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import generateDescriptor from "./lib/generate";

export const sample = createTRPCRouter({
  hello: publicProcedure.query(({}) => {
    return {
      greeting: `Hello`,
    };
  }),
  generate: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(({ input: { address } }) => {
      return generateDescriptor(1, address as `0x${string}`);
    }),
});
