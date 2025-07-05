"use client";

import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";

import { useState } from "react";
import { Textarea } from "~/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import SampleAddressAbiCard from "./sampleAddressAbiCard";
import { Button } from "~/components/ui/button";

import { ZodError } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useErc7730Store } from "~/store/erc7730Provider";
import useFunctionStore, { useOperationStore } from "~/store/useOperationStore";
import generateFromERC7730 from "./generateFromERC7730";
import { isAddress } from "viem";
import { Erc7730 } from "~/store/types";
import { components } from "~/generate/api-types";

type InputTypes = "address" | "abi" | "protocol" | "schema";

const fetchProtocolContracts = async (protocol: string) => {
  const response = await fetch(
    `/api/trpc/sample.protocols?input=${JSON.stringify({ json: { protocol } })}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch protocol contracts");
  }

  return (await response.json()).result.data.json;
};

const CardErc7730 = () => {
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState<InputTypes>("protocol");
  const [contracts, setContracts] = useState<
    { address: string; name: string }[] | undefined
  >();

  // Schema file
  const [schema, setSchema] = useState<File | undefined>();
  const readSchema = (): Promise<Erc7730 | undefined> => {
    if (!schema) {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        const text = e?.target?.result;
        if (!text) {
          return;
        }
        resolve(JSON.parse(text.toString()) as Erc7730);
      };
      reader.readAsText(schema);
    });
  };

  const { setValidateOperation } = useOperationStore();
  const { setErc7730, setFinalErc7730 } = useErc7730Store((state) => state);
  const router = useRouter();

  const {
    mutateAsync: fetchERC7730Metadata,
    isPending: loading,
    error,
  } = useMutation({
    mutationFn: ({ input, type }: { input: string; type: InputTypes }) =>
      ["address", "abi"].includes(type)
        ? generateFromERC7730({
            input,
            inputType: type as "address" | "abi",
          })
        : Promise.resolve(null),
  });

  const isContractSchema = (
    schema: Erc7730,
  ): schema is Erc7730 & {
    context: {
      $id?: string | null;
      contract: components["schemas"]["InputContract"];
    };
  } => {
    return "contract" in schema.context;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let type = inputType;
    let data = input;
    let schema: Erc7730 | undefined;

    if (type === "schema") {
      schema = await readSchema();
      if (!schema) {
        return;
      }

      if (isContractSchema(schema)) {
        const address = schema.context.contract.deployments[0]?.address;
        if (address) {
          type = "address";
          data = address;
        } else {
          return;
        }
      }
    }

    if (type === "protocol") {
      if (!isAddress(data)) {
        setContracts(await fetchProtocolContracts(data));
        return;
      }
      type = "address";
    }

    const erc7730 = await fetchERC7730Metadata({ input: data, type });

    if (erc7730) {
      useFunctionStore.persist.clearStorage();

      if (schema) {
        setErc7730({
          ...erc7730,
          ...schema,
          display: {
            ...erc7730.display,
            formats: {
              ...erc7730.display.formats,
              ...schema.display.formats,
            },
          },
        });
        setFinalErc7730(schema);

        for (const format of Object.keys(schema.display.formats)) {
          setValidateOperation(format);
        }
      } else {
        setErc7730(erc7730);
      }

      router.push("/metadata");
    }
  };

  const onTabChange = (value: string) => {
    setInputType(value as InputTypes);
    setInput("");
  };

  return (
    <div className="w-full lg:w-[580px]">
      <form onSubmit={handleSubmit} className="mb-4 flex w-full flex-col gap-4">
        <Tabs defaultValue="protocol" onValueChange={onTabChange}>
          <TabsList className="mb-4 grid w-full grid-cols-4">
            <TabsTrigger value="protocol">Protocol</TabsTrigger>
            <TabsTrigger value="address">Contract Address</TabsTrigger>
            <TabsTrigger value="abi">ABI</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>
          <TabsContent value="protocol">
            {contracts?.length ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {contracts.map((contract) => (
                    <Card className="w-full max-w-sm" key={contract.address}>
                      <CardHeader>
                        <CardTitle>{contract.name}</CardTitle>
                        <CardDescription>
                          {contract.address.substring(0, 12)}..
                          {contract.address.substring(
                            contract.address.length - 10,
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardFooter className="flex-col gap-2">
                        <Button
                          className="w-full"
                          onClick={() => setInput(contract.address)}
                          disabled={contract.address === input}
                        >
                          {contract.address === input ? "Selected" : "Select"}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
                <p className="text-center">
                  Can take up to 3 minutes to load. The model isn't great for
                  cost-saving reasons, but can easily be swapped out.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-4">
                  <Label htmlFor="eth-address">Protocol name</Label>
                  <Input
                    id="protocol-name"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <p className="text-center">
                    Can take up to 3 minutes to load. The model isn't great for
                    cost-saving reasons, but can easily be swapped out.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="address">
            <div className="space-y-4">
              <div className="space-y-4">
                <Label htmlFor="eth-address">Contract Address</Label>
                <Input
                  id="contract-address"
                  placeholder="0x..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <p className="text-center">Can take up to 3 minutes to load</p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="abi">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="abi">ABI</Label>
                <Textarea
                  id="abi"
                  placeholder="Paste your ABI here..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="schema">
            <div className="space-y-4">
              <div className="grid w-full items-center gap-3">
                <Label htmlFor="schema">Schema</Label>
                <Input
                  id="schema"
                  type="file"
                  className="w-full"
                  onChange={(e) => setSchema(e.target.files?.[0])}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <Button type="submit" disabled={loading}>
          Submit
        </Button>
      </form>

      <SampleAddressAbiCard setInput={setInput} inputType={inputType} />

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            {error instanceof ZodError
              ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                JSON.parse(error.message)[0].message
              : error.message}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CardErc7730;
