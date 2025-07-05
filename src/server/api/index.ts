import { Address } from "abitype";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

import { generateText, Output } from "ai";
import { openrouter } from "./lib/openrouter";

const { MODEL = "openrouter/cypher-alpha:free" } = process.env;

// Reimplemented generate function
//import generateDescriptor from "./lib/generate";
//return generateDescriptor(1, address as `0x${string}`);

type SourcifyMatch = "match" | "exact_match";

type SourcifyChain = {
  chainId: string;
};

type SourcifyContract = {
  matchId: string;
  creationMatch: SourcifyMatch;
  runtimeMatch: SourcifyMatch;
  verifiedAt: string;
  match: SourcifyMatch;
  chainId: string;
  address: string;
  sources: Record<string, { content: string }>;
  abi: any[];
  devdoc: any;
  userdoc: any;
};

const fetchSourcifyChains = async (
  address: string,
): Promise<SourcifyChain[]> => {
  const response = await fetch(
    `https://sourcify.dev/server/v2/contract/all-chains/${address}`,
  );
  return (await response.json()).results as SourcifyChain[];
};

const fetchSourcifyContract = async (
  chainId: string,
  address: string,
): Promise<SourcifyContract> => {
  const response = await fetch(
    `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=sources,abi,devdoc,userdoc`,
  );
  return (await response.json()) as SourcifyContract;
};

const fetchAiInfo = async (address: Address) => {
  const chains = await fetchSourcifyChains(address);
  const chainIds = chains.map(({ chainId }) => chainId).sort();
  if (!chainIds?.[0]) {
    throw new Error("Contract not found");
  }

  const contract = await fetchSourcifyContract(chainIds[0], address);
  const data = {
    chainIds,
    sources: contract.sources,
    abi: contract.abi,
    devdoc: contract.devdoc,
    userdoc: contract.userdoc,
  };

  const filteredAbi = contract.abi.filter(
    (item) =>
      item.type === "function" &&
      !["view", "pure"].includes(item.stateMutability),
  );

  const prompt = `
		Analyze the follow data (ABI, source code, deveveloper documentation and user documentation on an EVM) provided below:
		\`\`\`
		${JSON.stringify(data, null, 2)}
		\`\`\`

		Given that data, return a detailed list of the following functions:
		\`\`\`
		${JSON.stringify(filteredAbi, null, 2)}
		\`\`\`

		Make sure to include the human readable function name and arguments (including the name, type and ~100 character human readable name) that each function takes.
    
    In addition to this, provide the smart contract owner common name, legal name, URL and smart contract name.
	`;

  const result = await generateText({
    model: openrouter.chat(MODEL),
    system: `You are a helpful assistant that provides detailed information about smart contracts on the Ethereum Virtual Machine (EVM). You have access to the Sourcify data, which allows you to fetch verified smart contract data including ABI, source code, developer documentation, and user documentation.`,
    prompt,
    experimental_output: Output.object({
      schema: z.object({
        ownerName: z
          .string()
          .describe("The common name of the smart contract owner"),
        ownerLegalName: z
          .string()
          .describe("The legal name of the smart contract owner"),
        projectUrl: z
          .string()
          .describe("The URL of the project linked to the smart contract"),
        contractName: z.string().describe("The name of the smart contract"),
        functions: z.array(
          z
            .object({
              name: z.string().describe("The name of the function"),
              humanReadableName: z
                .string()
                .describe("The human-readable name of the function"),
              arguments: z.array(
                z
                  .object({
                    name: z.string().describe("The name of the argument"),
                    type: z.string().describe("The type of the argument"),
                    humanReadableName: z
                      .string()
                      .describe("The human-readable name of the argument"),
                  })
                  .describe("The arguments of the function"),
              ),
            })
            .describe("All data linked to an EVM function"),
        ),
      }),
    }),
  });

  const cleaned = result.text.replace(/^\s*```json/, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(cleaned);

  if (data.userdoc?.methods?.constructor) {
    delete data.userdoc.methods.constructor;
  }

  if (data.devdoc?.methods?.constructor) {
    delete data.devdoc.methods.constructor;
  }

  return { ...data, ai: parsed };
};

const fetchUpstreamData = async (address: Address) => {
  const response = await fetch("http://localhost:8000/api/py/generateERC7730", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address }),
  });
  return await response.json();
};

export const sample = createTRPCRouter({
  generate: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ input: { address } }) => {
      const [upstream, ai] = await Promise.all([
        fetchUpstreamData(address as Address),
        fetchAiInfo(address as Address),
      ]);
      return { ...upstream, ...ai };
    }),
});
