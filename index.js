const { Chain, Common, Hardfork } = require("@ethereumjs/common");
const { Block } = require("@ethereumjs/block");
const { join } = require("path");
const { readFileSync } = require("fs");
const { Address } = require("@ethereumjs/util");
const { Transaction } = require("@ethereumjs/tx");

const solc = require("solc");

const { runTx } = require("./evm/run");

function getContractInput() {
    return {
        language: "Solidity",
        sources: {
            "Memory.sol": {
                content: readFileSync(join(__dirname, "Memory.sol"), "utf8"),
            },
        },
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            evmVersion: "london",
            outputSelection: {
                "*": {
                    "*": ["abi", "evm.bytecode"],
                },
            },
        },
    };
}

function compileContract() {
    const input = getContractInput();
    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        for (const error of output.errors) {
            if (error.severity === "error") {
                console.error(error.formattedMessage);
                return;
            }
        }
    }

    return output;
}
