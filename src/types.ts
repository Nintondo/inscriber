export interface ApiUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKeyHex?: string;
  redeemScriptHex?: string;
  rawHex: string;
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
  utxos: ApiUTXO[];
  publicKey: Buffer;
  signPsbtHex: (
    psbtHex: string
  ) => Promise<{ psbtHex: string; signatures: (string | undefined)[] }>;
}
