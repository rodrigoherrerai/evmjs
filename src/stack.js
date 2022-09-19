import { MAX_INTEGER_BIGINT } from "@ethereumjs/util";

export default class Stack {
    constructor() {
        this._store = [];
        this._maxHeight = 1024;
    }

    get length() {
        return this._store.length;
    }

    push(value) {
        if (value > MAX_INTEGER_BIGINT) {
            throw new EvmError(ERROR.OUT_OF_RANGE);
        }

        if (this._store.length >= this._maxHeight) {
            throw new EvmError(ERROR.STACK_OVERFLOW);
        }

        this._store.push(value);
    }

    pop() {
        if (this._store.length < 1) {
            throw new EvmError(ERROR.STACK_UNDERFLOW);
        }

        return this._store.pop();
    }

    popN(num) {
        if (this._store.length < num) {
            throw new EvmError(ERROR.STACK_UNDERFLOW);
        }

        if (num === 0) {
            return [];
        }

        return this._store.splice(-1 * num).reverse();
    }

    peek(num) {
        const peekArray = [];

        for (let peek = 1; peek <= num; peek++) {
            const index = this._store.length - peek;
            if (index < 0) {
                throw new EvmError(ERROR.STACK_UNDERFLOW);
            }
            peekArray.push(this._store[index]);
        }
        return peekArray;
    }

    swap(position) {
        if (this._store.length <= position) {
            throw new EvmError(ERROR.STACK_UNDERFLOW);
        }

        const head = this._store.length - 1;
        const i = this._store.length - position - 1;

        const tmp = this._store[head];
        this._store[head] = this._store[i];
        this._store[i] = tmp;
    }

    dup(position) {
        if (this._store.length < position) {
            throw new EvmError(ERROR.STACK_UNDERFLOW);
        }

        const i = this._store.length - position;
        this.push(this._store[i]);
    }
}
