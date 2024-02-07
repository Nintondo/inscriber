import {
  opcodes,
  crypto as belCrypto,
  networks,
  Psbt,
  Transaction,
} from "belcoinjs-lib";
import { MAX_CHUNK_LEN, MAX_PAYLOAD_LEN } from "./consts";
import { ApiUTXO, Chunk, InscribeParams, SplitUtxosParams } from "./types";
import {
  bufferToChunk,
  calculateFeeForLastTx,
  calculateFeeForPsbt,
  calculateFeeForPsbtWithManyOutputs,
  calculateTransactionNumber,
  compile,
  numberToChunk,
  opcodeToChunk,
} from "./utils";

export async function inscribe({
  toAddress,
  contentType,
  data,
  feeRate,
  inputData,
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

  const transactionsAmount = calculateTransactionNumber([...inscription]);
  const splitHex = await splitUtxos({
    feeRate,
    address: fromAddress,
    count: transactionsAmount,
    signPsbtHex,
    inputData,
  });
  const utxos: ApiUTXO[] = [];
  const splitTransaction = Transaction.fromHex(splitHex);
  for (let i = 0; i < transactionsAmount; i++) {
    utxos.push({
      txid: splitTransaction.getId(),
      vout: i,
      value: splitTransaction.outs[i].value,
    });
  }

  let p2shInput: any | undefined = undefined;
  let lastLock: any | undefined = undefined;
  let lastPartial: any | undefined = undefined;

  while (inscription.length) {
    if (!utxos.length)
      throw new Error(
        "Need 1 more utxo to create all necessary transactions for this inscription"
      );
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
      value: 100000,
    };

    let tx = new Psbt({ network: networks.bitcoin });
    tx.setVersion(1);

    if (p2shInput) tx.addInput(p2shInput);
    tx.addOutput(p2shOutput);

    tx.addInput({
      hash: utxos[0].txid,
      index: utxos[0].vout,
      sequence: 0xfffffffe,
      nonWitnessUtxo: Buffer.from(splitHex, "hex"),
    });

    let fee = 0;

    if (p2shInput === undefined) {
      fee = await calculateFeeForPsbt(
        tx.clone(),
        signPsbtHex,
        (psbt) => {
          return psbt.finalizeAllInputs();
        },
        feeRate,
        fromAddress
      );
    } else {
      fee = await calculateFeeForLastTx({
        feeRate,
        signPsbtHex,
        psbt: tx.clone(),
        lastPartial,
        lastLock,
        address: fromAddress,
      });
    }

    const change = utxos[0].value - fee - 100000;
    if (change <= 0) throw new Error("Insufficient funds");
    else tx.addOutput({ address: fromAddress, value: change });

    utxos.shift();

    tx = Psbt.fromHex(await signPsbtHex(tx.toHex())!);

    if (p2shInput !== undefined) {
      const signature = tx.data.inputs[0].partialSig![0].signature;

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

    txs.push(tx.extractTransaction(true).toHex());

    const transaction = tx.extractTransaction(true);
    p2shInput = {
      hash: transaction.getId(),
      index: 0,
      nonWitnessUtxo: transaction.toBuffer(),
      redeemScript: lock,
    };
    lastPartial = partial;
    lastLock = lock;
  }

  if (!utxos.length)
    throw new Error(
      "Need 1 more utxo in wallet in order to create all transactions"
    );

  let lastTx = new Psbt({ network: networks.bitcoin });
  lastTx.setVersion(1);
  lastTx.addInput(p2shInput);
  lastTx.addInput({
    hash: utxos[0].txid,
    index: utxos[0].vout,
    sequence: 0xfffffffe,
    nonWitnessUtxo: Buffer.from(splitHex, "hex"),
  });
  lastTx.addOutput({ address: toAddress, value: 100000 });

  const fee = await calculateFeeForLastTx({
    feeRate,
    signPsbtHex,
    psbt: lastTx.clone(),
    lastPartial,
    lastLock,
    address: fromAddress,
  });

  const change = utxos[0].value - fee - 100000;
  if (change <= 0) throw new Error("Insufficient funds");
  else lastTx.addOutput({ address: fromAddress, value: change });

  lastTx = Psbt.fromHex(await signPsbtHex(lastTx.toHex())!);

  const signature = lastTx.data.inputs[0].partialSig![0].signature;

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
  txs.unshift(splitHex);

  return txs;
}

export async function splitUtxos({
  feeRate,
  count,
  signPsbtHex,
  address,
  inputData,
}: SplitUtxosParams): Promise<string> {
  if (!inputData.utxos.length) throw new Error("No utxos provided");
  const hexes = inputData.hexes;
  let psbt = new Psbt({ network: networks.bitcoin });
  psbt.setVersion(1);
  let availabelAmount = 0;
  for (let i = 0; i < inputData.utxos.length; i++) {
    psbt.addInput({
      hash: inputData.utxos[i].txid,
      index: inputData.utxos[i].vout,
      nonWitnessUtxo: Buffer.from(hexes[i], "hex"),
    });
    availabelAmount += inputData.utxos[i].value;
  }
  availabelAmount -= await calculateFeeForPsbtWithManyOutputs({
    psbt: psbt.clone(),
    outputAmount: count,
    feeRate,
    address,
    signPsbtHex,
  });

  for (let i = 0; i < count; i++) {
    psbt.addOutput({
      address,
      value: Math.floor(availabelAmount / count),
    });
  }

  psbt = Psbt.fromHex(await signPsbtHex(psbt.toHex())!);
  psbt.finalizeAllInputs();
  return psbt.extractTransaction(true).toHex();
}
