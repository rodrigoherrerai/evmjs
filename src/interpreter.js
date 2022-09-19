import { Opcode } from "@ethereumjs/evm/dist/opcodes/codes.js";
import Memory from "./memory.js";
import { trap } from "./opcodes/utils.js";
import Stack from "./stack.js";

export default class Interpreter {
    constructor(evm, env, gasLeft) {
        this.evm = evm;
        this.env = env;
        this.eei = this.evm.eei;
        this.common = this.evm.common;
        this.runState = {
            programCounter: 0,
            opCode: 0xfe,
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
        this.result = {
            logs: [],
            returnValue: undefined,
            selfdestruct: {},
        };
    }

    async run(code, opts = {}) {
        this.runState.code = code;
        this.runState.programCounter = opts.pc ?? this.runState.programCounter;

        let err;

        while (this.runState.programCounter < this.runState.code.length) {
            const opCode = this.runState.code[this.runState.programCounter];
            if (this.runState.shouldDoJumpAnalysis && (opCode === 0x56 || opCode === 0x57 || opCode === 0x5e)) {
                this.runState.validJumps = this.getValidJumpDests(this.runState.code);
                this.runState.shouldDoJumpAnalysis = false;
            }
            this.runState.opCode = opCode;

            try {
                await this.runStep();
            } catch (e) {
                break;
            }
        }
        return {
            runState: this.runState,
            exceptionError: err,
        };
    }

    async runStep() {
        const opInfo = this.lookupOpInfo(this.runState.opCode);
        let gas = BigInt(opInfo.fee);
        const gasLimitClone = this.getGasLeft();

        this.useGas(gas);

        // Increase the program counter.
        this.runState.programCounter++;

        // Execute the opcode.
        const opFn = this.getOpHandler(opInfo);

        if (opInfo.isAsync) {
            await opFn.apply(null, [this.runState, this.common]);
        } else {
            opFn.apply(null, [this.runState, this.common]);
        }
    }

    lookupOpInfo(op) {
        return this.evm.opcodes.get(op) ?? this.evm.opcodes.get(0xfe); // 0xfe: INVALID
    }

    getGasLeft() {
        return this.runState.gasLeft;
    }

    useGas(amount) {
        this.runState.gasLeft -= amount;

        if (this.runState.gasLeft < BigInt(0)) {
            this.runState.gasLeft = BigInt(0);
            trap("Out of gas");
        }
    }

    getOpHandler(opInfo) {
        return this.evm.handlers.get(opInfo.code);
    }

    getValidJumpDests(code) {
        const jumps = new Uint8Array(code.length).fill(0);

        for (let i = 0; i < code.length; i++) {
            const opcode = code[i];
            if (opcode <= 0x7f) {
                if (opcode >= 0x60) {
                    i += opcode - 0x5f;
                } else if (opcode === 0x5b) {
                    jumps[i] = 1;
                } else if (opcode === 0x5c) {
                    jumps[i] = 2;
                }
            }
        }
        return jumps;
    }

    getCode() {
        return this.env.code;
    }

    getCodeSize() {
        return BigInt(this.env.code.length);
    }

    getCallValue() {
        return this.env.callValue;
    }

    getCallData() {
        return this.env.callData;
    }

    getCallDataSize() {
        return BigInt(this.env.callData.length);
    }

    async storageLoad(key, original = false) {
        return this.eei.storageLoad(this.env.address, key, original);
    }

    async storageStore(key, value) {
        await this.eei.storageStore(this.env.address, key, value);
        const account = await this.eei.getAccount(this.env.address);
        this.env.contract = account;
    }

    finish(returnData) {
        this.result.returnValue = returnData;
        trap("STOP");
    }
}
