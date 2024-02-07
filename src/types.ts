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
  signPsbtHex: (psbtHex: string) => Promise<string>;
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
  signPsbtHex: (psbtHex: string) => Promise<string>;
}

export interface SplitUtxosParams {
  feeRate: number;
  count: number;
  signPsbtHex: (psbtHex: string) => Promise<string>;
  address: string;
  inputData: InputData;
}

export interface InputData {
  utxos: ApiUTXO[];
  hexes: string[];
}
