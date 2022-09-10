const { Address } = require("@ethereumjs/util");

const defaults = {
    value: BigInt(0),
    caller: Address.zero(),
    data: Buffer.alloc(0),
    depth: 0,
    isStatic: false,
    isCompiled: false,
    delegatecall: false,
    gasRefund: BigInt(0),
};

class Message {
    constructor(opts) {
        this.to = opts.to;
        this.value = opts.value ?? defaults.value;
        this.caller = opts.caller ?? defaults.caller;
        this.gasLimit = opts.gasLimit;
        this.data = opts.data ?? defaults.data;
        this.depth = opts.depth ?? defaults.depth;
        this.code = opts.code;
        this._codeAddress = opts.codeAddress;
        this.isStatic = opts.isStatic ?? defaults.isStatic;
        this.isCompiled = opts.isCompiled ?? defaults.isCompiled;
        this.salt = opts.salt;
        this.selfdestruct = opts.selfdestruct;
        this.delegatecall = opts.delegatecall ?? defaults.delegatecall;
        this.authcallOrigin = opts.authcallOrigin;
        this.gasRefund = opts.gasRefund ?? defaults.gasRefund;
    }

    get codeAddress() {
        const codeAddress = this._codeAddress ?? this.to;
        if (!codeAddress) {
            throw new Error("Missing code address");
        }
        return codeAddress;
    }
}

module.exports.Message = Message;
