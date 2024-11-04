import {
  script as bscript,
  Network,
  networks,
  payments,
  Psbt,
} from "belcoinjs-lib";

import {
  MAX_CHUNK_LEN,
  SERVICE_FEE,
  SERVICE_FEE_MAINNET_ADDRESS,
  SERVICE_FEE_TESTNET_ADDRESS,
  UTXO_MIN_VALUE,
} from "./consts.js";
import { InscribeParams } from "./types.js";
import { getAddressType, getWintessUtxo, toXOnly } from "./utils.js";

async function calcFeeForFundPsbt(
  psbt: Psbt,
  feeRate: number,
  signPsbt: (psbtBase64: string) => Promise<string>
) {
  psbt.addOutput({ address: psbt.txOutputs[0].address, value: 0 });
  const signedPsbt = Psbt.fromBase64(await signPsbt(psbt.toBase64()));
  const virtualSize = signedPsbt.extractTransaction(true).virtualSize();

  return virtualSize * feeRate;
}

async function calcFeeForRevealPsbt(
  payment: payments.Payment,
  feeRate: number,
  address: string,
  xOnlyPubKey: Buffer,
  signPsbt: (
    psbtBase64: string,
    disableTweakSigner?: boolean
  ) => Promise<string>,
  network: Network
) {
  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: Buffer.alloc(32),
    index: 0,
    tapInternalKey: xOnlyPubKey,
    witnessUtxo: {
      script: payment.output!,
      value: UTXO_MIN_VALUE + 100,
    },
    tapLeafScript: [
      {
        leafVersion: payment.redeem!.redeemVersion!,
        script: payment.redeem!.output!,
        controlBlock: payment.witness![payment.witness!.length - 1],
      },
    ],
  });
  psbt.addOutput({ address, value: UTXO_MIN_VALUE });

  const signedPsbt = Psbt.fromBase64(await signPsbt(psbt.toBase64(), true));
  const virtualSize = signedPsbt.extractTransaction(true).virtualSize();

  return virtualSize * feeRate;
}

export async function inscribe({
  toAddress,
  contentType,
  data,
  feeRate,
  getUtxos,
  publicKey,
  signPsbt,
  network,
  fromAddress,
}: InscribeParams): Promise<string[]> {
  const xOnlyPubKey = toXOnly(publicKey);
  const addressType = getAddressType(fromAddress, network);

  const txs: string[] = [];

  const scriptChunks = [
    xOnlyPubKey,
    bscript.OPS.OP_CHECKSIG,
    bscript.OPS.OP_FALSE,
    bscript.OPS.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    1,
    Buffer.from(contentType, "utf8"),
    0,
  ];

  for (let i = 0; i < data.length; i += MAX_CHUNK_LEN) {
    let end = Math.min(i + MAX_CHUNK_LEN, data.length);
    scriptChunks.push(data.subarray(i, end));
  }
  scriptChunks.push(bscript.OPS.OP_ENDIF);
  const inscriptionScript = bscript.compile(scriptChunks);

  const payment = payments.p2tr({
    internalPubkey: xOnlyPubKey,
    redeem: {
      output: inscriptionScript,
      redeemVersion: 192,
    },
    scriptTree: [
      {
        output: inscriptionScript,
      },
      {
        output: inscriptionScript,
      },
    ],
    network,
  });

  const requiredAmount =
    (await calcFeeForRevealPsbt(
      payment,
      feeRate,
      toAddress,
      xOnlyPubKey,
      signPsbt,
      network
    )) + UTXO_MIN_VALUE;
  const utxos = await getUtxos(requiredAmount + SERVICE_FEE);

  if (!utxos || !Array.isArray(utxos)) {
    throw new Error("Insufficient funds");
  }

  const fundPsbt = new Psbt({ network });

  utxos.forEach((utxo) => {
    fundPsbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: getWintessUtxo(utxo, addressType, publicKey, network),
      nonWitnessUtxo: Buffer.from(utxo.hex, "hex"),
    });
  });

  fundPsbt.addOutput({
    address: payment.address!,
    value: requiredAmount,
  });
  fundPsbt.addOutput({
    address:
      network.bech32 === networks.testnet.bech32
        ? SERVICE_FEE_TESTNET_ADDRESS
        : SERVICE_FEE_MAINNET_ADDRESS,
    value: SERVICE_FEE,
  });
  fundPsbt.addOutput({
    address: fromAddress,
    value:
      utxos.reduce((acc, val) => (acc += val.value), 0) -
      SERVICE_FEE -
      requiredAmount -
      (await calcFeeForFundPsbt(fundPsbt.clone(), feeRate, signPsbt)),
  });

  const signedFundPsbt = Psbt.fromBase64(await signPsbt(fundPsbt.toBase64()));
  const fundTx = signedFundPsbt.extractTransaction(true);
  txs.push(fundTx.toHex());

  const revealPsbt = new Psbt({ network });
  revealPsbt.addInput({
    hash: fundTx.getId(),
    index: 0,
    witnessUtxo: {
      script: payment.output!,
      value: requiredAmount,
    },
    tapLeafScript: [
      {
        leafVersion: 192,
        script: inscriptionScript,
        controlBlock: payment.witness![payment.witness!.length - 1],
      },
    ],
    tapInternalKey: xOnlyPubKey,
  });
  revealPsbt.addOutput({
    address: toAddress,
    value: UTXO_MIN_VALUE,
  });

  const signedRevealpsbt = Psbt.fromBase64(
    await signPsbt(revealPsbt.toBase64(), true)
  );
  const revealTx = signedRevealpsbt.extractTransaction(true);
  txs.push(revealTx.toHex());

  return txs;
}
