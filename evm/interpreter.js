const { Stack } = require("./stack");
const { Memory } = require("./memory");

class Interpreter {
    constructor(evm, eei, env, gasLeft) {
        this.evm = evm;
        this.eei = eei;
        this.common = this.evm.common;
        this.runState = {
            programCounter: 0,
            opCode: 0xfe, // INVALID opcode
            memory: new Memory(),
            memoryWordCount: BigInt(0),
            highestMemCost: BigInt(0),
            stack: new Stack(),
            returnStack: new Stack(1023), 
            code: Buffer.alloc(0),
            validJumps: Uint8Array.from([]),
            eei: this._eei,
            env,
            shouldDoJumpAnalysis: true,
            interpreter: this,
            gasRefund: env.gasRefund,
            gasLeft,
            returnBuffer: Buffer.alloc(0),
        };
        this.env = env;
        this._result = {
            logs: [],
            returnValue: undefined,
            selfdestruct: {},
        };
    }

    async run(code, opts) {
        while (this.runState.programCounter < this.runState.code.length) {
            const opCode = this.runState.code[this.runState.programCounter];

            try {
                await this.runStep();
            } catch (e) {
                throw e;
            }
        }

        return {
            runState: this.runState,
        };
    }

    async runStep() {
        const opInfo = this.lookupOpInfo(this.runState.opCode);

        let gas = BigInt(opInfo.fee);

        this.useGas(gas);

        // Increase the program counter.
        this.runState.programCounter++;

        const opFn = this.getOpHandler(opInfo);

        opFn.apply(null, [this.runState, this.common]);
    }

    getOpHandler() {}

    lookupOpInfo(op) {
        return this.evm.opcodes.get(op);
    }

    useGas(amount) {
        this.runState.gasLeft -= amount;

        if (this.runState.gasLeft < BigInt(0)) {
            this.runState.gasLeft = BigInt(0);
            throw new Error("Out of gas");
        }
    }

    refundGas(amount) {}

    safeRefund(amount) {}

    addStipend(amount) {}

    getExternalBalance(address) {}

    storageStore(key, value) {}

    storageLoad(key) {}
}

module.exports.Interpreter = Interpreter;
