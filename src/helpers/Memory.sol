// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Memory {

    function m() external pure returns (bytes memory result) {
        bytes memory x = "12312456";

        assembly {
            result := x // or result := 0x90
        }
    }

  
}