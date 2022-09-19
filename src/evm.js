import { Address, generateAddress, bigIntToBuffer, KECCAK256_NULL } from "@ethereumjs/util";

import { Message } from "./message.js";
import { TransientStorage } from "./transientStorage.js";
import Interpreter from "./interpreter.js";
import { getOpcodesForHF } from "./opcodes/codes.js";

export class EVM {
    constructor(opts) {
        this.eei = opts.eei;
        this.transientStorage = new TransientStorage();
        this.common = opts.common;

        this.getActiveOpcodes();
    }

    async runCall(opts) {
        let message = opts.message;

        if (!message) {
            this.block = opts.block;
            this.tx = {
                gasPrice: opts.gasPrice ?? BigInt(0),
                origin: opts.origin ?? opts.caller ?? Address.zero(),
            };

            const caller = opts.caller ?? Address.zero();
            const value = opts.value ?? BigInt(0);

            message = new Message({
                caller,
                gasLimit: opts.gasLimit ?? BigInt(0xffffff),
                to: opts.to,
                value,
                data: opts.data,
                code: opts.code,
                depth: opts.depth,
                isCompiled: opts.isCompiled,
                isStatic: opts.isStatic,
                salt: opts.salt,
                selfdestruct: {},
                delegatecall: opts.delegatecall,
            });
        }
        await this.eei.checkpoint();
        this.transientStorage.checkpoint();

        let result;
        if (message.to) {
            result = await this.executeCall(message);
        } else {
            result = await this.executeCreate(message);
        }
        // We check for errors.
        const err = result.execResult.exceptionError;

        if (err) {
            result.execResult.selfdestruct = {};
            result.execResult.gasRefund = BigInt(0);
        } else {
            await this.eei.commit();
            this.transientStorage.commit();
        }

        return result;
    }

    async executeCall(message) {
        const account = await this.eei.getAccount(message.authcallOrigin ?? message.caller);
        let errorMessage;
        // Reduce tx value from sender
        if (!message.delegatecall) {
            try {
                await this.reduceSenderBalance(account, message);
            } catch (e) {
                errorMessage = e;
            }
        }
        // Load `to` account
        const toAccount = await this.eei.getAccount(message.to);
        // Add tx value to the `to` account
        if (!message.delegatecall) {
            try {
                await this.addToBalance(toAccount, message);
            } catch (e) {
                errorMessage = e;
            }
        }
        // Load code
        await this.loadCode(message);
        let exit = false;
        if (!message.code || message.code.length === 0) {
            exit = true;
        }
        if (errorMessage !== undefined) {
            exit = true;
        }
        if (exit) {
            return {
                execResult: {
                    gasRefund: message.gasRefund,
                    executionGasUsed: BigInt(0),
                    exceptionError: errorMessage,
                    returnValue: Buffer.alloc(0),
                },
            };
        }
        let result;
        result = await this.runInterpreter(message);
        return {
            execResult: result,
        };
    }

    async executeCreate(message) {
        const account = await this.eei.getAccount(message.caller);
        // Reduce tx value from sender
        await this.reduceSenderBalance(account, message);

        message.code = message.data;
        message.data = Buffer.alloc(0);
        message.to = await this.generateAddress(message);

        let toAccount = await this.eei.getAccount(message.to);

        await this.eei.clearContractStorage(message.to);

        toAccount = await this.eei.getAccount(message.to);
        // Add tx value to the `to` account
        let errorMessage;
        try {
            await this.addToBalance(toAccount, message);
        } catch (e) {
            errorMessage = e;
        }
        let exit = false;
        if (message.code === undefined || message.code.length === 0) {
            exit = true;
        }
        if (errorMessage !== undefined) {
            exit = true;
        }
        if (exit) {
            return {
                createdAddress: message.to,
                execResult: {
                    executionGasUsed: BigInt(0),
                    gasRefund: message.gasRefund,
                    exceptionError: errorMessage,
                    returnValue: Buffer.alloc(0),
                },
            };
        }

        let result = await this.runInterpreter(message);
        // fee for size of the return value
        let totalGas = result.executionGasUsed;
        let returnFee = BigInt(0);
        if (!result.exceptionError) {
            returnFee = BigInt(result.returnValue.length) * BigInt(this.common.param("gasPrices", "createData"));
            totalGas = totalGas + returnFee;
        }

        // If enough gas and allowed code size
        let CodestoreOOG = false;
        result.executionGasUsed = totalGas;

        // Save code if a new contract was created
        if (!result.exceptionError && result.returnValue !== undefined && result.returnValue.length !== 0) {
            await this.eei.putContractCode(message.to, result.returnValue);
        }

        return {
            createdAddress: message.to,
            execResult: result,
        };
    }

    async generateAddress(message) {
        const acc = await this.eei.getAccount(message.caller);
        let newNonce = acc.nonce;
        const addr = generateAddress(message.caller.buf, bigIntToBuffer(newNonce));
        return new Address(addr);
    }

    async reduceSenderBalance(account, message) {
        account.balance -= message.value;

        if (account.balance < BigInt(0)) {
            throw new Error("Insufficient balance.");
        }

        const result = this.eei.putAccount(message.authcallOrigin ?? message.caller, account);

        return result;
    }

    async runInterpreter(message, opts) {
        const env = {
            address: message.to ?? Address.zero(),
            caller: message.caller ?? Address.zero(),
            callData: message.data ?? Buffer.from([0]),
            callValue: message.value ?? BigInt(0),
            code: message.code,
            isStatic: message.isStatic ?? false,
            depth: message.depth ?? 0,
            gasPrice: this.tx.gasPrice,
            origin: this.tx.origin ?? message.caller ?? Address.zero(),
            block: this.block ?? defaultBlock(),
            contract: await this.eei.getAccount(message.to ?? Address.zero()),
            codeAddress: message.codeAddress,
            gasRefund: message.gasRefund,
        };

        const interpreter = new Interpreter(this, env, message.gasLimit);

        const interpreterResults = await interpreter.run(message.code, opts);

        let result = interpreter.result;
        let gasUsed = message.gasLimit - interpreterResults.runState.gasLeft;

        return {
            ...result,
            runState: {
                ...interpreterResults.runState,
                ...result,
                ...interpreter._env,
            },
            exceptionError: interpreterResults.exceptionError,
            gas: interpreterResults.runState?.gasLeft,
            executionGasUsed: gasUsed,
            gasRefund: interpreterResults.runState.gasRefund,
            returnValue: result.returnValue ? result.returnValue : Buffer.alloc(0),
        };
    }

    async addToBalance(toAccount, message) {
        const newBalance = toAccount.balance + message.value;
        toAccount.balance = newBalance;
        // putAccount as the nonce may have changed for contract creation
        const result = this.eei.putAccount(message.to, toAccount);
        return result;
    }

    async loadCode(message) {
        // @todo Add support for precompile.
        message.code = await this.eei.getContractCode(message.codeAddress);
        message.isCompiled = false;
    }
    getActiveOpcodes() {
        const data = getOpcodesForHF(this.common);
        this.opcodes = data.opcodes;
        this.dynamicGasHandlers = data.dynamicGasHandlers;
        this.handlers = data.handlers;
        return data.opcdes;
    }
}
