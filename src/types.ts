import { Network } from "belcoinjs-lib";

export interface ApiUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKeyHex?: string;
  redeemScriptHex?: string;
  hex: string;
}

export interface PrepareForMultipleInscriptionsInscribe {
  signPsbtHex: (
    psbtHex: string
  ) => Promise<{ psbtHex: string; signatures: (string | undefined)[] }>;
  utxos: ApiUTXO[];
  feeRate: number;
  amount: number;
  signleInscriptionCost: number;
  address: string;
  network: Network;
}

export interface Status {
  confirmed: boolean;
  block_height: number;
  block_hash: string;
  block_time: number;
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
  network: Network;
  publicKey: Buffer;
  getUtxos: (amount: number) => Promise<ApiUTXO[]>;
  signPsbt: (
    psbtBase64: string,
    disableTweakSigner?: boolean
  ) => Promise<string>;
}

export enum AddressType {
  P2PKH = 0,
  P2WPKH = 1,
  P2TR = 2,
  P2SH_P2WPKH = 3,
  M44_P2WPKH = 4,
  M44_P2TR = 5,
}
