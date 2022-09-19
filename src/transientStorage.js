export class TransientStorage {
    constructor() {
        this._storage = new Map();

        this._changeJournal = [];

        this._indices = [0];
    }

    get(addr, key) {
        const map = this._storage.get(addr.toString());
        if (!map) {
            return Buffer.alloc(32);
        }
        const value = map.get(key.toString("hex"));
        if (!value) {
            return Buffer.alloc(32);
        }
        return value;
    }

    put(addr, key, value) {
        if (key.length !== 32) {
            throw new Error("Transient storage key must be 32 bytes long");
        }
        if (value.length > 32) {
            throw new Error("Transient storage value cannot be longer than 32 bytes");
        }
        const addrString = addr.toString();
        if (!this._storage.has(addrString)) {
            this._storage.set(addrString, new Map());
        }
        const map = this._storage.get(addrString);
        const keyStr = key.toString("hex");
        const prevValue = map.get(keyStr) ?? Buffer.alloc(32);
        this._changeJournal.push({
            addr: addrString,
            key: keyStr,
            prevValue,
        });
        map.set(keyStr, value);
    }

    commit() {
        if (this._indices.length === 0) throw new Error("Nothing to commit");
        this._indices.pop();
    }

    checkpoint() {
        this._indices.push(this._changeJournal.length);
    }

    revert() {
        const lastCheckpoint = this._indices.pop();
        if (typeof lastCheckpoint === "undefined") throw new Error("Nothing to revert");
        for (let i = this._changeJournal.length - 1; i >= lastCheckpoint; i--) {
            const { key, prevValue, addr } = this._changeJournal[i];
            this._storage.get(addr).set(key, prevValue);
        }
        this._changeJournal.splice(lastCheckpoint, this._changeJournal.length - lastCheckpoint);
    }

    toJSON() {
        const result = {};
        for (const [address, map] of this._storage.entries()) {
            result[address] = {};
            for (const [key, value] of map.entries()) {
                result[address][key] = value.toString("hex");
            }
        }
        return result;
    }

    clear() {
        this._storage = new Map();
        this._changeJournal = [];
    }
}
