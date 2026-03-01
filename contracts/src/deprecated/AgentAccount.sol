// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAccount} from "@account-abstraction/core/BaseAccount.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract AgentAccount is BaseAccount, Initializable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IEntryPoint private immutable _ENTRY_POINT;
    address public runtimeSigner;

    event RuntimeSignerRotated(address indexed oldSigner, address indexed newSigner);

    error InvalidSigner();
    error OnlyEntryPointOrSelf();
    error ZeroAddress();

    modifier onlyEntryPointOrSelf() {
        _checkEntryPointOrSelf();
        _;
    }

    function _checkEntryPointOrSelf() internal view {
        if (msg.sender != address(entryPoint()) && msg.sender != address(this)) {
            revert OnlyEntryPointOrSelf();
        }
    }

    constructor(IEntryPoint entryPoint_) {
        _ENTRY_POINT = entryPoint_;
        _disableInitializers();
    }

    function initialize(address runtimeSigner_) external initializer {
        if (runtimeSigner_ == address(0)) revert ZeroAddress();
        runtimeSigner = runtimeSigner_;
    }

    function entryPoint() public view override returns (IEntryPoint) {
        return _ENTRY_POINT;
    }

    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyEntryPointOrSelf
        returns (bytes memory)
    {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        return result;
    }

    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas)
        external
        onlyEntryPointOrSelf
        returns (bytes[] memory results)
    {
        require(targets.length == values.length && values.length == datas.length, "length mismatch");
        results = new bytes[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].call{value: values[i]}(datas[i]);
            if (!success) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            results[i] = result;
        }
    }

    function setRuntimeSigner(address newSigner) external onlyEntryPointOrSelf {
        if (newSigner == address(0)) revert ZeroAddress();
        address old = runtimeSigner;
        runtimeSigner = newSigner;
        emit RuntimeSignerRotated(old, newSigner);
    }

    /// @dev FIX: Use tryRecover instead of recover to avoid reverts on malformed signatures.
    ///      Per EIP-4337, validation should return SIG_VALIDATION_FAILED (1), not revert.
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        view
        override
        returns (uint256 validationData)
    {
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(ethSignedHash, userOp.signature);
        if (err != ECDSA.RecoverError.NoError || recovered != runtimeSigner) return 1;
        return 0;
    }

    receive() external payable {}
}
