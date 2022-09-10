const { Chain, Common, Hardfork } = require("@ethereumjs/common");
const { Interpreter } = require("./interpreter");

const {
    Address,
    KECCAK256_NULL,
    MAX_INTEGER,
    bigIntToBuffer,
    generateAddress,
    generateAddress2,
    short,
    zeros,
} = require("@ethereumjs/util");

class EVM {
    constructor(opts) {
        this.eei = opts.eei;
        this.common = opts.common;
    }

    async executeCall(message) {
        const account = await this.eei.getAccount(message.authcallOrigin ?? message.caller);
        let errorMessage;
        // Reduce tx value from sender
        if (!message.delegatecall) {
            try {
                await this._reduceSenderBalance(account, message);
            } catch (e) {
                errorMessage = e;
            }
        }
        // Load `to` account
        const toAccount = await this.eei.getAccount(message.to);
        // Add tx value to the `to` account
        if (!message.delegatecall) {
            try {
                await this._addToBalance(toAccount, message);
            } catch (e) {
                errorMessage = e;
            }
        }
        // Load code
        await this._loadCode(message);
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
        if (message.isCompiled) {
            result = await this.runPrecompile(message.code, message.data, message.gasLimit);
            result.gasRefund = message.gasRefund;
        } else {
            result = await this.runInterpreter(message);
        }
        if (message.depth === 0) {
            this.postMessageCleanup();
        }
        return {
            execResult: result,
        };
    }

    async executeCreate(message) {
        const account = await this.eei.getAccount(message.caller);
        // Reduce tx value from sender
        await this._reduceSenderBalance(account, message);

        message.code = message.data;
        message.data = Buffer.alloc(0);
        message.to = await this._generateAddress(message);

        let toAccount = await this.eei.getAccount(message.to);

        await this.eei.clearContractStorage(message.to);

        toAccount = await this.eei.getAccount(message.to);

        // Add tx value to the `to` account
        let errorMessage;
        try {
            await this._addToBalance(toAccount, message);
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
            returnFee = BigInt(result.returnValue.length) * BigInt(this._common.param("gasPrices", "createData"));
            totalGas = totalGas + returnFee;
        }
        // Check for SpuriousDragon EIP-170 code size limit
        let allowedCodeSize = true;
        if (
            !result.exceptionError &&
            this._common.gteHardfork(common_1.Hardfork.SpuriousDragon) &&
            result.returnValue.length > Number(this._common.param("vm", "maxCodeSize"))
        ) {
            allowedCodeSize = false;
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

    // @todo check this.
    async runInterpreter(message, opts) {
        const env = {
            address: message.to,
            caller: message.caller,
            callData: message.data ?? Buffer.from([0]),
            callValue: message.value ?? BigInt(0),
            code: message.code,
            isStatic: message.isStatic ?? false,
            depth: message.depth ?? 0,
            gasPrice: this._tx.gasPrice,
            origin: this._tx.origin,
            block: this._block,
            contract: await this.eei.getAccount(message.to ?? util_1.Address.zero()),
            codeAddress: message.codeAddress,
            gasRefund: message.gasRefund,
        };
        const interpreter = new Interpreter(this, this.eei, env, message.gasLimit);
        if (message.selfdestruct) {
            interpreter._result.selfdestruct = message.selfdestruct;
        }
        const interpreterRes = await interpreter.run(message.code, opts);
        let result = interpreter._result;
        let gasUsed = message.gasLimit - interpreterRes.runState.gasLeft;
        if (interpreterRes.exceptionError) {
            if (
                interpreterRes.exceptionError.error !== exceptions_1.ERROR.REVERT &&
                interpreterRes.exceptionError.error !== exceptions_1.ERROR.INVALID_EOF_FORMAT
            ) {
                gasUsed = message.gasLimit;
            }
            // Clear the result on error
            result = {
                ...result,
                logs: [],
                selfdestruct: {},
            };
        }
        return {
            ...result,
            runState: {
                ...interpreterRes.runState,
                ...result,
                ...interpreter._env,
            },
            exceptionError: interpreterRes.exceptionError,
            gas: interpreterRes.runState?.gasLeft,
            executionGasUsed: gasUsed,
            gasRefund: interpreterRes.runState.gasRefund,
            returnValue: result.returnValue ? result.returnValue : Buffer.alloc(0),
        };
    }

    runCall(opts) {}

    generateAddress(message) {}

    reduceSenderBalance(account, message) {}

    addToBalance() {}
}
