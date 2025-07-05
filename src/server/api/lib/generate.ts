import { type AbiFunction, AbiParameter, toFunctionSelector } from "viem";
import type { SolidityTuple, SolidityArrayWithTuple, Address } from "abitype";
import fetch from "cross-fetch";

export enum ABIDataType {
  UINT = "uint",
  INT = "int",
  UFIXED = "ufixed",
  FIXED = "fixed",
  ADDRESS = "address",
  BOOL = "bool",
  BYTES = "bytes",
  STRING = "string",
}

export enum FieldFormat {
  DURATION = "DURATION",
  DATE = "DATE",
  AMOUNT = "AMOUNT",
  RAW = "RAW",
  NFT_NAME = "NFT_NAME",
  ADDRESS_NAME = "ADDRESS_NAME",
  CALL_DATA = "CALL_DATA",
}

export enum DateEncoding {
  BLOCKHEIGHT = "BLOCKHEIGHT",
  TIMESTAMP = "TIMESTAMP",
}

export enum AddressNameType {
  COLLECTION = "COLLECTION",
  CONTRACT = "CONTRACT",
  TOKEN = "TOKEN",
  EOA = "EOA",
  WALLET = "WALLET",
}

export type PathElement =
  | { kind: "field"; identifier: string }
  | { kind: "array" }
  | { kind: "arrayElement" }
  | { kind: "arraySlice" };

export interface DataPath {
  absolute: boolean;
  elements: PathElement[];
}

export const ROOT_DATA_PATH: DataPath = { absolute: true, elements: [] };

export function dataPathAppend(base: DataPath, element: PathElement): DataPath {
  return { absolute: base.absolute, elements: [...base.elements, element] };
}

interface SchemaStruct {
  kind: "struct";
  components: Record<string, SchemaTree>;
}
interface SchemaArray {
  kind: "array";
  component: SchemaTree;
}
interface SchemaLeaf {
  kind: "leaf";
  dataType: ABIDataType;
}
export type SchemaTree = SchemaStruct | SchemaArray | SchemaLeaf;

export interface InputAddressNameParameters {
  types: AddressNameType[];
}
export interface InputDateParameters {
  encoding: DateEncoding;
}
export type InputFieldParameters =
  | InputAddressNameParameters
  | InputDateParameters
  | undefined;

export interface InputFieldDescription {
  type: "description";
  path: DataPath;
  label: string;
  format: FieldFormat;
  params?: InputFieldParameters;
}
export interface InputNestedFields {
  type: "nested";
  path: DataPath;
  fields: InputField[];
}
export type InputField = InputFieldDescription | InputNestedFields;

export interface InputFormat {
  fields: InputField[];
}
export interface InputDisplay {
  formats: Record<string, InputFormat>;
}

export interface OwnerInfo {
  legalName?: string;
  url?: string;
}
export interface InputMetadata {
  owner?: string;
  info?: OwnerInfo | null;
}

export interface InputDeployment {
  chainId: number;
  address: Address;
}
export interface InputContract {
  abi: AbiFunction[];
  deployments: InputDeployment[];
}
export interface InputContractContext {
  contract: InputContract;
}

export interface EIP712SchemaField {
  name: string;
  type: string;
}
export interface EIP712Schema {
  primaryType: string;
  types: Record<string, EIP712SchemaField[]>;
}
export interface InputEIP712 {
  schemas: EIP712Schema[];
  deployments: InputDeployment[];
}
export interface InputEIP712Context {
  eip712: InputEIP712;
}
export type Context = InputContractContext | InputEIP712Context;

function containsAnyOf(name: string, ...values: string[]): boolean {
  const lower = name.toLowerCase();
  return values.some((v) => lower.includes(v));
}
function getLeafName(path: DataPath): string {
  for (let i = path.elements.length - 1; i >= 0; i -= 1) {
    const el = path.elements[i];
    if (el?.kind === "field") return toTitle(el.identifier).trim();
  }
  return "unknown";
}
function toTitle(word: string): string {
  return word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\s]+/)
    .map((w) => (w?.[0] ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

const ARRAY_REGEX = /\[\d*\]$/;
function isArrayType(t: string) {
  return ARRAY_REGEX.test(t);
}
function arrayItemType(t: string) {
  return t.replace(ARRAY_REGEX, "");
}
function mapBaseType(base: string): ABIDataType | null {
  const b = base.toLowerCase();
  if (b.startsWith("uint")) return ABIDataType.UINT;
  if (b.startsWith("int")) return ABIDataType.INT;
  if (b.startsWith("ufixed")) return ABIDataType.UFIXED;
  if (b.startsWith("fixed")) return ABIDataType.FIXED;
  if (b === "address") return ABIDataType.ADDRESS;
  if (b === "bool") return ABIDataType.BOOL;
  if (b.startsWith("bytes")) return ABIDataType.BYTES;
  if (b === "string") return ABIDataType.STRING;
  return null;
}

function abiStruct(children: readonly AbiParameter[] | undefined): SchemaTree {
  const components: Record<string, SchemaTree> = {};
  for (const c of children ?? []) {
    if (!c.name) {
      continue;
    }
    components[c.name] = abiComponentToTree(c);
  }
  return { kind: "struct", components };
}

function isTupleType(comp: AbiParameter): comp is {
  type: SolidityTuple | SolidityArrayWithTuple;
  components: readonly AbiParameter[];
} {
  return comp.type === "tuple";
}

function abiComponentToTree(comp: AbiParameter): SchemaTree {
  if (isArrayType(comp.type)) {
    return {
      kind: "array",
      component: abiComponentToTree({
        ...comp,
        type: arrayItemType(comp.type),
      }),
    };
  }

  if (isTupleType(comp)) {
    return abiStruct(comp.components);
  }

  const dt = mapBaseType(comp.type) ?? ABIDataType.BYTES;
  return { kind: "leaf", dataType: dt };
}
export function abiFunctionToTree(fn: AbiFunction): SchemaTree {
  return abiStruct(fn.inputs);
}

function eip712Struct(
  fields: EIP712SchemaField[],
  types: Record<string, EIP712SchemaField[]>,
): SchemaTree {
  const components: Record<string, SchemaTree> = {};
  for (const f of fields) components[f.name] = eip712FieldToTree(f, types);
  return { kind: "struct", components };
}
function eip712FieldToTree(
  f: EIP712SchemaField,
  types: Record<string, EIP712SchemaField[]>,
): SchemaTree {
  const { type } = f;
  if (isArrayType(type))
    return {
      kind: "array",
      component: eip712FieldToTree({ ...f, type: arrayItemType(type) }, types),
    };
  if (types[type]) return eip712Struct(types[type], types);
  return { kind: "leaf", dataType: mapBaseType(type) ?? ABIDataType.BYTES };
}
export function eip712SchemaToTree(schema: EIP712Schema): SchemaTree {
  const root = schema.types[schema.primaryType];
  if (!root) throw new Error("Primary type not found");
  return eip712Struct(root, schema.types);
}

function generateField(
  name: string,
  dt: ABIDataType,
): { format: FieldFormat; params?: InputFieldParameters } {
  switch (dt) {
    case ABIDataType.UINT:
    case ABIDataType.INT:
      if (containsAnyOf(name, "duration"))
        return { format: FieldFormat.DURATION };
      if (containsAnyOf(name, "height"))
        return {
          format: FieldFormat.DATE,
          params: { encoding: DateEncoding.BLOCKHEIGHT },
        };
      if (
        containsAnyOf(
          name,
          "deadline",
          "expiration",
          "until",
          "time",
          "timestamp",
        )
      )
        return {
          format: FieldFormat.DATE,
          params: { encoding: DateEncoding.TIMESTAMP },
        };
      if (containsAnyOf(name, "amount", "value", "price"))
        return { format: FieldFormat.AMOUNT };
      return { format: FieldFormat.RAW };
    case ABIDataType.ADDRESS:
      if (containsAnyOf(name, "collection", "nft"))
        return {
          format: FieldFormat.NFT_NAME,
          params: { types: [AddressNameType.COLLECTION] },
        };
      if (containsAnyOf(name, "spender"))
        return {
          format: FieldFormat.ADDRESS_NAME,
          params: { types: [AddressNameType.CONTRACT] },
        };
      if (containsAnyOf(name, "asset", "token"))
        return {
          format: FieldFormat.ADDRESS_NAME,
          params: { types: [AddressNameType.TOKEN] },
        };
      if (
        containsAnyOf(
          name,
          "from",
          "to",
          "owner",
          "recipient",
          "receiver",
          "account",
        )
      )
        return {
          format: FieldFormat.ADDRESS_NAME,
          params: { types: [AddressNameType.EOA, AddressNameType.WALLET] },
        };
      return {
        format: FieldFormat.ADDRESS_NAME,
        params: { types: Object.values(AddressNameType) },
      };
    case ABIDataType.BYTES:
      if (containsAnyOf(name, "calldata"))
        return { format: FieldFormat.CALL_DATA };
      return { format: FieldFormat.RAW };
    default:
      return { format: FieldFormat.RAW };
  }
}

function generateFields(schema: SchemaTree, path: DataPath): InputField[] {
  switch (schema.kind) {
    case "struct": {
      if (path === ROOT_DATA_PATH) {
        return Object.entries(schema.components).flatMap(([n, c]) =>
          generateFields(
            c,
            dataPathAppend(path, { kind: "field", identifier: n }),
          ),
        );
      }
      const nested = Object.entries(schema.components).flatMap(([n, c]) =>
        generateFields(c, {
          absolute: false,
          elements: [{ kind: "field", identifier: n }],
        }),
      );
      return [{ type: "nested", path, fields: nested }];
    }
    case "array": {
      const nextPath = dataPathAppend(path, { kind: "array" });
      if (schema.component.kind === "leaf")
        return generateFields(schema.component, nextPath);
      return [
        {
          type: "nested",
          path: nextPath,
          fields: generateFields(schema.component, {
            absolute: false,
            elements: [],
          }),
        },
      ];
    }
    case "leaf": {
      const leafName = getLeafName(path);
      const { format, params } = generateField(leafName, schema.dataType);
      return [{ type: "description", path, label: leafName, format, params }];
    }
  }
}

function generateFormats(
  trees: Record<string, SchemaTree>,
): Record<string, InputFormat> {
  const out: Record<string, InputFormat> = {};
  for (const [k, t] of Object.entries(trees)) {
    const f = generateFields(t, ROOT_DATA_PATH);
    if (f.length) out[k] = { fields: f };
  }
  return out;
}
function generateDisplay(trees: Record<string, SchemaTree>): InputDisplay {
  return { formats: generateFormats(trees) };
}
function generateMetadata(
  owner?: string | null,
  legal?: string | null,
  url?: string | null,
): InputMetadata {
  return {
    owner: owner ?? undefined,
    info: legal && url ? { legalName: legal, url } : null,
  };
}

async function getContractAbis(
  chain: number,
  addr: Address,
): Promise<AbiFunction[] | null> {
  const networks: Record<number, { baseUrl: string }> = {
    1: { baseUrl: "https://api.etherscan.io/api" },
    10: { baseUrl: "https://api-optimistic.etherscan.io/api" },
    137: { baseUrl: "https://api.polygonscan.com/api" },
    42161: { baseUrl: "https://api.arbiscan.io/api" },
  };
  const net = networks[chain];
  if (!net) return null;

  const key = process.env.ETHERSCAN_API_KEY ?? "";
  const url = `${net.baseUrl}?module=contract&action=getsourcecode&address=${addr}&apikey=${key}`;
  try {
    const res = await fetch(url);
    const json: any = await res.json();
    const abiRaw = json.result?.[0]?.ABI;
    if (!abiRaw || abiRaw === "Contract source code not verified") return null;
    return JSON.parse(abiRaw);
  } catch {
    return null;
  }
}

function getFunctions(abi: AbiFunction[]) {
  return Object.fromEntries(
    abi.filter((f) => (f as any).type !== "event").map((f) => [f.name, f]),
  );
}

async function ctxEIP712(
  chain: number,
  addr: Address,
  eip: string | Uint8Array,
): Promise<[InputEIP712Context, Record<string, SchemaTree>]> {
  const str = typeof eip === "string" ? eip : new TextDecoder().decode(eip);
  const schemas: EIP712Schema[] = JSON.parse(str);
  const trees = Object.fromEntries(
    schemas.map((s) => [s.primaryType, eip712SchemaToTree(s)]),
  );
  return [
    { eip712: { schemas, deployments: [{ chainId: chain, address: addr }] } },
    trees,
  ];
}
async function ctxCalldata(
  chain: number,
  addr: Address,
  abiJson?: string | Uint8Array | null,
): Promise<[InputContractContext, Record<string, SchemaTree>]> {
  let abi: AbiFunction[] | null = null;
  if (abiJson) {
    abi = JSON.parse(
      typeof abiJson === "string" ? abiJson : new TextDecoder().decode(abiJson),
    );
  } else {
    abi = await getContractAbis(chain, addr);
  }
  if (!abi) throw new Error("No ABI available");
  const fnMap = getFunctions(abi);
  const trees = Object.fromEntries(
    Object.values(fnMap).map((f) => [
      toFunctionSelector(f),
      abiFunctionToTree(f),
    ]),
  );
  return [
    {
      contract: {
        abi: Object.values(fnMap),
        deployments: [{ chainId: chain, address: addr }],
      },
    },
    trees,
  ];
}
async function generateContext(
  chain: number,
  addr: Address,
  abi?: string | Uint8Array | null,
  eip?: string | Uint8Array | null,
): Promise<[Context, Record<string, SchemaTree>]> {
  return eip ? ctxEIP712(chain, addr, eip) : ctxCalldata(chain, addr, abi);
}

export interface GenerateDescriptorOptions {
  abi?: string | Uint8Array | null;
  eip712Schema?: string | Uint8Array | null;
  owner?: string | null;
  legalName?: string | null;
  url?: string | null;
}

export async function generateDescriptor(
  chainId: number,
  contractAddress: Address,
  opts: GenerateDescriptorOptions = {},
): Promise<{
  context: Context;
  metadata: InputMetadata;
  display: InputDisplay;
}> {
  const [context, trees] = await generateContext(
    chainId,
    contractAddress,
    opts.abi ?? null,
    opts.eip712Schema ?? null,
  );
  const metadata = generateMetadata(
    opts.owner ?? null,
    opts.legalName ?? null,
    opts.url ?? null,
  );
  const display = generateDisplay(trees);
  return { context, metadata, display };
}
export default generateDescriptor;
