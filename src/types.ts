import { Psbt } from "belcoinjs-lib";

export interface ApiUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKeyHex?: string;
  redeemScriptHex?: string;
}

export interface Status {
  confirmed: boolean;
  block_height: number;
  block_hash: string;
  block_time: number;
}

export interface ICalculateFeeForPsbtWithManyOutputs {
  psbt: Psbt;
  outputAmount: number;
  feeRate: number;
  address: string;
  signPsbtHex: (
    psbtHex: string
  ) => Promise<{ psbtHex: string; signatures: (string | undefined)[] }>;
}

export interface Chunk {
  buf?: Buffer;
  len?: number;
  opcodenum: number;
}

export interface InscribeParams {
  toAddress: string;
  fromAddress: string;
  contentType: string;
  data: Buffer;
  feeRate: number;
  inputData: InputData;
  publicKey: Buffer;
  signPsbtHex: (
    psbtHex: string
  ) => Promise<{ psbtHex: string; signatures: (string | undefined)[] }>;
}

export interface SplitUtxosParams {
  feeRate: number;
  count: number;
  signPsbtHex: (
    psbtHex: string
  ) => Promise<{ psbtHex: string; signatures: (string | undefined)[] }>;
  address: string;
  inputData: InputData;
}

export interface InputData {
  utxos: ApiUTXO[];
  hexes: string[];
}
