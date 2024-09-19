import { Transaction, Network, payments, address } from "belcoinjs-lib";
import { AddressType, ApiUTXO } from "./types.js";

export function gptFeeCalculate(
  inputCount: number,
  outputCount: number,
  feeRate: number
) {
  // Constants defining the weight of each component of a transaction
  const BASE_TX_WEIGHT = 10 * 4; // 10 vbytes * 4 weight units per vbyte
  const INPUT_WEIGHT = 148 * 4; // 148 vbytes * 4 weight units per vbyte for each input
  const OUTPUT_WEIGHT = 34 * 4; // 34 vbytes * 4 weight units per vbyte for each output

  // Calculate the weight of the transaction
  const transactionWeight =
    BASE_TX_WEIGHT + inputCount * INPUT_WEIGHT + outputCount * OUTPUT_WEIGHT;

  // Calculate the fee by multiplying transaction weight by fee rate (satoshis per weight unit)
  const fee = Math.ceil((transactionWeight / 4) * feeRate);

  return fee;
}

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

export const getWintessUtxo = (
  utxo: ApiUTXO,
  addressType: number | undefined,
  publicKey: Buffer,
  network: Network
) => {
  const value = Transaction.fromBuffer(Buffer.from(utxo.hex, "hex")).outs[
    utxo.vout
  ].value;
  switch (addressType) {
    case AddressType.P2TR:
      return {
        script: payments.p2tr({
          internalPubkey: toXOnly(publicKey),
          network,
        }).output!,
        value,
      };
    case AddressType.P2PKH:
      return {
        script: payments.p2pkh({
          pubkey: publicKey,
          network,
        }).output!,
        value,
      };
    case AddressType.P2WPKH:
      return {
        script: payments.p2wpkh({
          pubkey: publicKey,
          network,
        }).output!,
        value,
      };
    default:
      return undefined;
  }
};

export function getAddressType(
  addressStr: string,
  network: Network
): AddressType.P2WPKH | AddressType.P2PKH | AddressType.P2TR | undefined {
  try {
    const version = address.fromBase58Check(addressStr).version;
    if (version === network.pubKeyHash) return 0;
    if (version === network.scriptHash) return undefined;
  } catch {
    try {
      const version = address.fromBech32(addressStr).version;
      if (version === 0x00) return 1;
      if (version === 0x01) return 2;
    } catch {}
  }

  return undefined;
}
