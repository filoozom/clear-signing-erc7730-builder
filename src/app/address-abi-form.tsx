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
import useFunctionStore from "~/store/useOperationStore";
import generateFromERC7730 from "./generateFromERC7730";
import { isAddress } from "viem";

type InputTypes = "address" | "abi" | "protocol";

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
  const { setErc7730 } = useErc7730Store((state) => state);
  const router = useRouter();

  const {
    mutateAsync: fetchERC7730Metadata,
    isPending: loading,
    error,
  } = useMutation({
    mutationFn: ({ input, type }: { input: string; type: InputTypes }) =>
      generateFromERC7730({
        input,
        inputType: type,
      }),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let type = inputType;

    if (type === "protocol") {
      if (!isAddress(input)) {
        setContracts(await fetchProtocolContracts(input));
        return;
      }
      type = "address";
    }

    const erc7730 = await fetchERC7730Metadata({ input, type });

    if (erc7730) {
      console.log(erc7730);
      useFunctionStore.persist.clearStorage();

      setErc7730(erc7730);
      router.push("/metadata");
    }
  };

  const onTabChange = (value: string) => {
    setInputType(value as "address" | "abi");
    setInput("");
  };

  return (
    <div className="w-full lg:w-[580px]">
      <form onSubmit={handleSubmit} className="mb-4 flex w-full flex-col gap-4">
        <Tabs defaultValue="protocol" onValueChange={onTabChange}>
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="protocol">Protocol</TabsTrigger>
            <TabsTrigger value="address">Contract Address</TabsTrigger>
            <TabsTrigger value="abi">ABI</TabsTrigger>
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
