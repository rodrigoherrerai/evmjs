const ceil = (value, ceiling) => {
    const r = value % ceiling;
    if (r === 0) {
        return value;
    } else {
        return value + ceiling - r;
    }
};

export default class Memory {
    constructor() {
        this._store = Buffer.alloc(0);
    }

    extend(offset, size) {
        if (size === 0) {
            return;
        }

        const newSize = ceil(offset + size, 32);
        const sizeDiff = newSize - this._store.length;
        if (sizeDiff > 0) {
            this._store = Buffer.concat([this._store, Buffer.alloc(sizeDiff)]);
        }
    }

    write(offset, size, value) {
        if (size === 0) {
            return;
        }

        this.extend(offset, size);

        if (value.length !== size) throw new Error("Invalid value size");
        if (offset + size > this._store.length) throw new Error("Value exceeds memory capacity");

        for (let i = 0; i < size; i++) {
            this._store[offset + i] = value[i];
        }
    }

    read(offset, size) {
        this.extend(offset, size);

        const returnBuffer = Buffer.allocUnsafe(size);
        // Copy the stored "buffer" from memory into the return Buffer

        const loaded = Buffer.from(this._store.slice(offset, offset + size));
        returnBuffer.fill(loaded, 0, loaded.length);

        if (loaded.length < size) {
            // fill the remaining part of the Buffer with zeros
            returnBuffer.fill(0, loaded.length, size);
        }

        return returnBuffer;
    }
}
