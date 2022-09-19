import { join } from "path";
import { readFileSync } from "fs";
import { defaultAbiCoder as AbiCoder, Interface } from "@ethersproject/abi";
import { Address } from "@ethereumjs/util";
import { Chain, Common, Hardfork } from "@ethereumjs/common";
import { Transaction } from "@ethereumjs/tx";
import { EEI, VM } from "@ethereumjs/vm";
import { buildTransaction, encodeDeployment, encodeFunction } from "./helpers/tx-builder.js";
import { getAccountNonce, insertAccount } from "./helpers/account-utils.js";
import { Block } from "@ethereumjs/block";
import { EVM } from "./evm.js";

import solc from "solc";
import path from "path";
import { fileURLToPath } from "url";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { Blockchain } from "@ethereumjs/blockchain";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INITIAL_GREETING = "Hello, World!";
const SECOND_GREETING = "Hola, Mundo!";

const common = new Common({
    chain: Chain.Rinkeby,
    hardfork: Hardfork.Istanbul,
});
const block = Block.fromBlockData({ header: { extraData: Buffer.alloc(97) } }, { common });

function getSolcInput() {
    return {
        language: "Solidity",
        sources: {
            "helpers/Memory.sol": {
                content: readFileSync(join(__dirname, "helpers", "Memory.sol"), "utf8"),
            },
            // If more contracts were to be compiled, they should have their own entries here
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

function compileContracts() {
    const input = getSolcInput();
    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    let compilationFailed = false;

    if (output.errors) {
        for (const error of output.errors) {
            if (error.severity === "error") {
                console.error(error.formattedMessage);
                compilationFailed = true;
            } else {
                console.warn(error.formattedMessage);
            }
        }
    }

    if (compilationFailed) {
        return undefined;
    }

    return output;
}

function getGreeterDeploymentBytecode(solcOutput) {
    return solcOutput.contracts["helpers/Memory.sol"].Memory.evm.bytecode.object;
}

async function deployContract(vm, senderPrivateKey, deploymentBytecode) {
    // Contracts are deployed by sending their deployment bytecode to the address 0
    // The contract params should be abi-encoded and appended to the deployment bytecode.
    const data = encodeDeployment(deploymentBytecode.toString("hex"), {
        types: [],
        values: [],
    });
    const txData = {
        data,
        nonce: await getAccountNonce(vm, senderPrivateKey),
    };

    const tx = Transaction.fromTxData(buildTransaction(txData), { common }).sign(senderPrivateKey);

    const deploymentResult = await vm.runTx({ tx, block });

    if (deploymentResult.execResult.exceptionError) {
        throw deploymentResult.execResult.exceptionError;
    }

    return deploymentResult.createdAddress;
}

async function setGreeting(vm, senderPrivateKey, contractAddress, greeting) {
    const data = encodeFunction("setGreeting", {
        types: ["string"],
        values: [greeting],
    });

    const txData = {
        to: contractAddress,
        data,
        nonce: await getAccountNonce(vm, senderPrivateKey),
    };

    const tx = Transaction.fromTxData(buildTransaction(txData), { common }).sign(senderPrivateKey);

    const setGreetingResult = await vm.runTx({ tx, block });

    if (setGreetingResult.execResult.exceptionError) {
        throw setGreetingResult.execResult.exceptionError;
    }
}

async function getGreeting(vm, contractAddress, caller) {
    const sigHash = new Interface(["function m()"]).getSighash("m");
    const greetResult = await vm.evm.runCall({
        to: contractAddress,
        caller: caller,
        origin: caller, // The tx.origin is also the caller here
        data: Buffer.from(sigHash.slice(2), "hex"),
        block,
    });

    if (greetResult.execResult.exceptionError) {
        throw greetResult.execResult.exceptionError;
    }
    const results = AbiCoder.decode(["string"], greetResult.execResult.returnValue);

    return results;
}

async function main() {
    const accountPk = Buffer.from("e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109", "hex");

    const stateManager = new DefaultStateManager();
    const eei = new EEI(stateManager, common, new Blockchain({ common }));
    const evm = new EVM({ eei, common });
    const vm = await VM.create({ common, stateManager, evm });
    const accountAddress = Address.fromPrivateKey(accountPk);

    console.log("Account: ", accountAddress.toString());
    await insertAccount(vm, accountAddress);

    console.log("Compiling...");

    const solcOutput = compileContracts();
    if (solcOutput === undefined) {
        throw new Error("Compilation failed");
    } else {
        console.log("Compiled the contract");
    }

    const bytecode = getGreeterDeploymentBytecode(solcOutput);
    console.log("bytecode - - - - - - - - -- - - - - - ");
    // console.log(bytecode);
    console.log(" - - - - - - - - - - -  -  - - - -- - - - -");
    console.log("Deploying the contract...");

    const contractAddress = await deployContract(vm, accountPk, bytecode);

    console.log("Contract address:", contractAddress.toString());

    const greeting = await getGreeting(vm, contractAddress, accountAddress);

    console.log("result -->", greeting);

    // console.log("Greeting:", greeting);

    // if (greeting !== INITIAL_GREETING)
    //   throw new Error(
    //     `initial greeting not equal, received ${greeting}, expected ${INITIAL_GREETING}`
    //   );

    // console.log("Changing greeting...");

    // await setGreeting(vm, accountPk, contractAddress, SECOND_GREETING);

    // const greeting2 = await getGreeting(vm, contractAddress, accountAddress);

    // console.log("Greeting:", greeting2);

    // if (greeting2 !== SECOND_GREETING)
    //   throw new Error(
    //     `second greeting not equal, received ${greeting2}, expected ${SECOND_GREETING}`
    //   );

    // // Now let's look at what we created. The transaction
    // // should have created a new account for the contract
    // // in the state. Let's test to see if it did.

    // const createdAccount = await vm.stateManager.getAccount(contractAddress);

    // console.log("-------results-------");
    // console.log("nonce: " + createdAccount.nonce.toString());
    // console.log("balance in wei: ", createdAccount.balance.toString());
    // console.log("storageRoot: 0x" + createdAccount.storageRoot.toString("hex"));
    // console.log("codeHash: 0x" + createdAccount.codeHash.toString("hex"));
    // console.log("---------------------");

    // console.log("Everything ran correctly!");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
