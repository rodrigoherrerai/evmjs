async function runTx(evm, eei, opts) {
    const state = eei;

    const { tx, block } = opts;

    const caller = tx.getSenderAddress();

    let fromAccount = await state.getAccount(caller);

    const { nonce, balance } = fromAccount;

    const cost = tx.getUpfrontCost(block.header.baseFeePerGas);

    if (balance < cost) {
        throw new Error("Sender doesn't have enough funds for this transaction.");
    }

    const gasPrice = tx.gasPrice;
    const txCost = tx.gasLimit * gasPrice;
    fromAccount.balance -= txCost;
    await state.putAccount(caller, fromAccount);

    // We execute the message after doing some basic checks.
    const { value, data, to } = tx;

    const results = await this.evm.runCall({
        block,
        gasPrice,
        caller,
        gasLimit,
        to,
        value,
        data,
    });

    // We increment the nonce after running the call.
    const acc = await state.getAccount(caller);
    acc.nonce++;
    await state.putAccount(caller, acc);

    // Update sender balance
    fromAccount = await state.getAccount(caller);
    const actualTxCost = results.totalGasSpent * gasPrice;
    const txCostDiff = txCost - actualTxCost;
    fromAccount.balance += txCostDiff;
    await state.putAccount(caller, fromAccount);
}

module.exports.runTx = runTx;
