class Stack {
    constructor(maxHeight) {
        this._store = [];
        this._maxHeight = 1024;
    }

    get length() {
        return this._store.length;
    }

    push(value) {
        if (this._store.length >= this._maxHeight) {
            throw new Error("Stack Overflow.");
        }
        this._store.push(value);
    }

    pop() {
        if (this._store.length < 1) {
            throw new Error("Stack Underflow");
        }
        return this._store.pop();
    }

    popN(num = 1) {
        if (this._store.length < num) {
            throw new Error("Stack Underflow");
        }
        if (num === 0) {
            return [];
        }
        return this._store.splice(-1 * num).reverse();
    }

    swap(position) {
        if (this._store.length <= position) {
            throw new Error("Stack Underflow");
        }
        const head = this._store.length - 1;
        const i = this._store.length - position - 1;
        const tmp = this._store[head];
        this._store[head] = this._store[i];
        this._store[i] = tmp;
    }

    dup(position) {
        if (this._store.length < position) {
            throw new Error("Stack Underflow");
        }
        const i = this._store.length - position;
        this.push(this._store[i]);
    }
}
module.exports.Stack = Stack;
