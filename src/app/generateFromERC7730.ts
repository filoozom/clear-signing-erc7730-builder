import { type paths } from "~/generate/api-types";
import { appRouter } from "~/server/api/root";
import { api } from "~/trpc/react";

type GenerateBody =
  paths["/api/py/generateERC7730"]["post"]["requestBody"]["content"]["application/json"];
export type GenerateResponse =
  paths["/api/py/generateERC7730"]["post"]["responses"]["200"]["content"]["application/json"];

export default async function generateERC7730({
  input,
  inputType,
}: {
  inputType: "address" | "abi";
  input: string;
}): Promise<GenerateResponse | null> {
  const body: GenerateBody = {
    address: inputType === "address" ? input : undefined,
    abi: inputType === "abi" ? input : undefined,
  };

  if (inputType !== "address") {
    throw new Error("not yet immplemented");
  }

  const response = await fetch(
    `/api/trpc/sample.generate?input=${JSON.stringify({ json: { address: input } })}`,
  );

  console.log(response);

  if (!response.ok) {
    const data = (await response.json()) as {
      message: string;
    };
    throw new Error(`API Error: ${data.message}`);
  }

  const data = (await response.json()).result.data.json as GenerateResponse;

  return data;
}
