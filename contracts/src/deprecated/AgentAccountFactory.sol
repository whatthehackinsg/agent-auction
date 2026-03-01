// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AgentAccount} from "./AgentAccount.sol";

contract AgentAccountFactory {
    AgentAccount public immutable ACCOUNT_IMPLEMENTATION;
    IEntryPoint public immutable ENTRY_POINT;

    event AccountCreated(address indexed account, address indexed runtimeSigner, uint256 salt);

    constructor(IEntryPoint entryPoint_) {
        ENTRY_POINT = entryPoint_;
        ACCOUNT_IMPLEMENTATION = new AgentAccount(entryPoint_);
    }

    function createAccount(address runtimeSigner, uint256 salt) external returns (AgentAccount) {
        address computed = getAddress(runtimeSigner, salt);
        if (computed.code.length > 0) {
            return AgentAccount(payable(computed));
        }

        ERC1967Proxy proxy = new ERC1967Proxy{salt: bytes32(salt)}(
            address(ACCOUNT_IMPLEMENTATION), abi.encodeCall(AgentAccount.initialize, (runtimeSigner))
        );

        emit AccountCreated(address(proxy), runtimeSigner, salt);
        return AgentAccount(payable(address(proxy)));
    }

    function getAddress(address runtimeSigner, uint256 salt) public view returns (address) {
        bytes memory proxyBytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(address(ACCOUNT_IMPLEMENTATION), abi.encodeCall(AgentAccount.initialize, (runtimeSigner)))
        );
        return Create2.computeAddress(bytes32(salt), keccak256(proxyBytecode));
    }
}
