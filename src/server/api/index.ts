import { Address } from "abitype";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

import { generateText, GenerateTextResult, Output, ToolSet } from "ai";
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

const parseStructured = (result: GenerateTextResult<ToolSet, any>): any => {
  const cleaned = result.text.replace(/^\s*```json/, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned);
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

		Make sure to include the human readable function name and arguments (including the name, type and concise human readable name) that each function takes.
    Makes human-readable names concise (2-5 words maximum), capital case, without any quotes, parenthesis or special characters. Prefer abbreviations (ID rather than identifier).
    
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
                .describe("The concise human-readable name of the function"),
              arguments: z.array(
                z
                  .object({
                    name: z.string().describe("The name of the argument"),
                    type: z.string().describe("The type of the argument"),
                    humanReadableName: z
                      .string()
                      .describe(
                        "The concise human-readable name of the argument",
                      ),
                  })
                  .describe("The arguments of the function"),
              ),
            })
            .describe("All data linked to an EVM function"),
        ),
      }),
    }),
  });

  if (data.userdoc?.methods?.constructor) {
    delete data.userdoc.methods.constructor;
  }

  if (data.devdoc?.methods?.constructor) {
    delete data.devdoc.methods.constructor;
  }

  return { ...data, ai: parseStructured(result) };
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

const fetchProtocolContracts = async (protocol: string) => {
  const result = await generateText({
    model: openrouter.chat(MODEL),
    system: `You are a helpful assistant that provides detailed information about smart contracts on the Ethereum Virtual Machine (EVM). You have access to the Sourcify data, which allows you to fetch verified smart contract data including ABI, source code, developer documentation, and user documentation.`,
    prompt: `Get all smart contracts linked to the \`${protocol}\` protocol.`,
    experimental_output: Output.object({
      schema: z.array(
        z.object({
          name: z.string().describe("The name of the smart contract"),
          address: z.string().describe("The address of the smart contract"),
        }),
      ),
    }),
  });

  return parseStructured(result);
};

export const sample = createTRPCRouter({
  generate: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ input: { address } }) => {
      try {
        const [upstream, ai] = await Promise.all([
          fetchUpstreamData(address as Address),
          fetchAiInfo(address as Address),
        ]);
        return { ...upstream, ...ai };
      } catch (err) {
        console.error(err);
        throw err;
      }
    }),
  protocols: publicProcedure
    .input(z.object({ protocol: z.string() }))
    .query(async ({ input: { protocol } }) => {
      try {
        return await fetchProtocolContracts(protocol);
      } catch (err) {
        console.error(err);
        throw err;
      }
    }),
});
