import { type paths } from "~/generate/api-types";

type GenerateBody =
  paths["/api/py/generateERC7730"]["post"]["requestBody"]["content"]["application/json"];
export type GenerateResponse =
  paths["/api/py/generateERC7730"]["post"]["responses"]["200"]["content"]["application/json"];

const generateContract = async (address: string) => {
  const response = await fetch(
    `/api/trpc/sample.generate?input=${JSON.stringify({ json: { address } })}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch contract information");
  }

  return (await response.json()).result.data.json as GenerateResponse;
};

const generateAbi = async (abi: string) => {
  const response = await fetch("/api/py/generateERC7730", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ abi }),
  });

  if (!response.ok) {
    const data = (await response.json()) as {
      message: string;
    };
    throw new Error(`API Error: ${data.message}`);
  }

  const data = (await response.json()) as GenerateResponse;

  return data;
};

export default async function generateERC7730({
  input,
  inputType,
}: {
  inputType: "address" | "abi" | "protocol";
  input: string;
}): Promise<GenerateResponse | null> {
  switch (inputType) {
    case "address":
      return await generateContract(input);
    case "abi":
      return await generateAbi(input);
  }

  return null;
}
