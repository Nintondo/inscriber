import { opcodes, crypto as belCrypto, networks, Psbt } from "belcoinjs-lib";

import { MAX_CHUNK_LEN, MAX_PAYLOAD_LEN, UTXO_MIN_VALUE } from "./consts.js";
import {
  InscribeParams,
  Chunk,
  ApiUTXO,
  PrepareForMultipleInscriptionsInscribe,
} from "./types.js";
import {
  bufferToChunk,
  compile,
  gptFeeCalculate,
  numberToChunk,
  opcodeToChunk,
} from "./utils.js";

export async function prepareToInscribeMultipleInscriptions({
  signPsbtHex,
  utxos,
  feeRate,
  amount,
  signleInscriptionCost,
  address,
}: PrepareForMultipleInscriptionsInscribe): Promise<string> {
  const psbt = new Psbt({ network: networks.bitcoin });
  utxos.forEach((f) => {
    psbt.addInput({
      hash: f.txid,
      index: f.vout,
      nonWitnessUtxo: Buffer.from(f.hex, "hex"),
    });
  });

  for (let i = 0; i < amount; i++) {
    psbt.addOutput({
      address: address,
      value: signleInscriptionCost,
    });
  }

  const change =
    utxos.reduce((acc, val) => (acc += val.value), 0) -
    signleInscriptionCost * amount -
    gptFeeCalculate(utxos.length, amount + 1, feeRate);

  if (change < 1000)
    throw new Error("Not enough balance for preparation, fix electrs");

  psbt.addOutput({
    address,
    value: change,
  });

  const { psbtHex } = await signPsbtHex(psbt.toHex());
  const signedPsbt = Psbt.fromHex(psbtHex);
  signedPsbt.finalizeAllInputs();

  return signedPsbt.extractTransaction(true).toHex();
}

export async function inscribe({
  toAddress,
  contentType,
  data,
  feeRate,
  utxos,
  publicKey,
  signPsbtHex,
  fromAddress,
}: InscribeParams): Promise<string[]> {
  let parts = [];
  const txs: string[] = [];

  while (data.length) {
    let part = data.slice(0, Math.min(MAX_CHUNK_LEN, data.length));
    data = data.slice(part.length);
    parts.push(part);
  }

  const inscription: Chunk[] = [
    bufferToChunk(Buffer.from("ord", "utf8")),
    numberToChunk(parts.length),
    bufferToChunk(Buffer.from(contentType, "utf8")),
    ...parts.flatMap((part, n) => [
      numberToChunk(parts.length - n - 1),
      bufferToChunk(part),
    ]),
  ];

  let p2shInput: any | undefined = undefined;
  let lastLock: any | undefined = undefined;
  let lastPartial: any | undefined = undefined;

  while (inscription.length) {
    let partial: Chunk[] = [];

    if (txs.length == 0) {
      partial.push(inscription.shift()!);
    }

    while (compile(partial).length <= MAX_PAYLOAD_LEN && inscription.length) {
      partial.push(inscription.shift()!);
      partial.push(inscription.shift()!);
    }

    if (compile(partial).length > MAX_PAYLOAD_LEN) {
      inscription.unshift(partial.pop()!);
      inscription.unshift(partial.pop()!);
    }

    const lock = compile([
      bufferToChunk(publicKey),
      opcodeToChunk(opcodes.OP_CHECKSIGVERIFY),
      ...partial.map(() => opcodeToChunk(opcodes.OP_DROP)),
      opcodeToChunk(opcodes.OP_TRUE),
    ]);

    const lockHash = belCrypto.hash160(lock);

    const p2shScript = compile([
      opcodeToChunk(opcodes.OP_HASH160),
      bufferToChunk(lockHash),
      opcodeToChunk(opcodes.OP_EQUAL),
    ]);

    const p2shOutput = {
      script: p2shScript,
      value: UTXO_MIN_VALUE,
    };

    let tx = new Psbt({ network: networks.bitcoin });
    tx.setVersion(1);

    if (p2shInput) tx.addInput(p2shInput);
    tx.addOutput(p2shOutput);

    let change = 0;
    const usedUtxos: ApiUTXO[] = [];
    const availableUtxos = utxos;
    while (change <= 0 && availableUtxos.length > 0) {
      tx.addInput({
        hash: availableUtxos[0].txid,
        index: availableUtxos[0].vout,
        sequence: 0xfffffffe,
        nonWitnessUtxo: Buffer.from(availableUtxos[0].hex, "hex"),
      });
      usedUtxos.push(availableUtxos[0]);
      availableUtxos.shift();

      let fee = 0;

      if (p2shInput === undefined) {
        fee = gptFeeCalculate(
          tx.data.inputs.length,
          tx.data.outputs.length + 1,
          feeRate
        );
      }

      change =
        usedUtxos.reduce((accumulator, utxo) => accumulator + utxo.value, 0) -
        fee -
        UTXO_MIN_VALUE;
      if (change < 0 && availableUtxos.length < 1)
        throw new Error("Insufficient funds");
      else if (change > 0)
        tx.addOutput({ address: fromAddress, value: change });
    }

    utxos.splice(0, usedUtxos.length);

    const { psbtHex, signatures } = await signPsbtHex(tx.toHex());
    tx = Psbt.fromHex(psbtHex);

    if (p2shInput !== undefined) {
      const signature = Buffer.from(signatures[0], "hex");

      const unlockScript = compile([
        ...lastPartial,
        bufferToChunk(signature),
        bufferToChunk(lastLock),
      ]);

      tx.finalizeInput(0, (_: any, input: any, script: any) => {
        return {
          finalScriptSig: unlockScript,
          finalScriptWitness: undefined,
        };
      });
      tx.finalizeInput(1);
    } else tx.finalizeAllInputs();

    const transaction = tx.extractTransaction(true);
    txs.push(transaction.toHex());

    utxos.unshift({
      txid: tx.extractTransaction(true).getId(),
      vout: 1,
      value: change,
      hex: tx.extractTransaction(true).toHex(),
    });

    p2shInput = {
      hash: transaction.getId(),
      index: 0,
      nonWitnessUtxo: transaction.toBuffer(),
      redeemScript: lock,
    };
    lastPartial = partial;
    lastLock = lock;
  }

  let lastTx = new Psbt({ network: networks.bitcoin });
  lastTx.setVersion(1);
  lastTx.addInput(p2shInput);
  lastTx.addOutput({ address: toAddress, value: UTXO_MIN_VALUE });
  lastTx.addOutput({
    address: "BDJqmvvM2Ceh3JcguE3xScBUAGE88nJjcj",
    value: 1000000,
  });

  let change = 0;
  const usedUtxos: ApiUTXO[] = [];
  const availableUtxos = utxos;
  while (change <= 0 && availableUtxos.length > 0) {
    lastTx.addInput({
      hash: availableUtxos[0].txid,
      index: availableUtxos[0].vout,
      sequence: 0xfffffffe,
      nonWitnessUtxo: Buffer.from(availableUtxos[0].hex, "hex"),
    });
    usedUtxos.push(availableUtxos[0]);
    availableUtxos.shift();

    const fee = gptFeeCalculate(
      lastTx.data.inputs.length,
      lastTx.data.outputs.length + 1,
      feeRate
    );

    change =
      usedUtxos.reduce((accumulator, utxo) => accumulator + utxo.value, 0) -
      fee -
      UTXO_MIN_VALUE -
      1000000;
    if (change <= 0 && availableUtxos.length < 1)
      throw new Error("Insufficient funds");
    else if (change > 0)
      lastTx.addOutput({ address: fromAddress, value: change });
  }

  const { psbtHex, signatures } = await signPsbtHex(lastTx.toHex());
  lastTx = Psbt.fromHex(psbtHex);

  const signature = Buffer.from(signatures[0], "hex");

  const unlockScript = compile([
    ...lastPartial,
    bufferToChunk(signature),
    bufferToChunk(lastLock),
  ]);

  lastTx.finalizeInput(0, (_: any, input: any, script: any) => {
    return {
      finalScriptSig: unlockScript,
      finalScriptWitness: undefined,
    };
  });
  lastTx.finalizeInput(1);

  const finalizedTx = lastTx.extractTransaction(true);
  txs.push(finalizedTx.toHex());

  return txs;
}
