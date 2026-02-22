// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/interfaces/PackedUserOperation.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {AgentAccountFactory} from "../src/AgentAccountFactory.sol";

contract AgentAccountTest is Test {
    AgentAccountFactory factory;
    AgentAccount account;

    // Use a real EntryPoint address as the "entry point" (we prank as it)
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    uint256 signerPk = 0xA11CE;
    address signer;

    uint256 wrongPk = 0xBEEF;
    address wrongSigner;

    address target = address(0xCAFE);

    function setUp() public {
        signer = vm.addr(signerPk);
        wrongSigner = vm.addr(wrongPk);

        // Deploy factory with a mock entry point (we'll call things directly via prank)
        // We need the EntryPoint to actually exist for the constructor, deploy minimal code there
        vm.etch(ENTRY_POINT, hex"00");

        factory = new AgentAccountFactory(IEntryPoint(ENTRY_POINT));
        account = factory.createAccount(signer, 0);
    }

    /* ── Factory ──────────────────────────────────────────────────── */

    function test_factory_createsDeterministicAddress() public view {
        address predicted = factory.getAddress(signer, 0);
        assertEq(address(account), predicted, "CREATE2 address mismatch");
    }

    function test_factory_sameParamsReturnsSameAccount() public {
        AgentAccount second = factory.createAccount(signer, 0);
        assertEq(address(second), address(account), "Duplicate deploy should return same address");
    }

    function test_factory_differentSaltDifferentAddress() public {
        AgentAccount different = factory.createAccount(signer, 1);
        assertTrue(address(different) != address(account), "Different salt should give different address");
    }

    /* ── Initialize ───────────────────────────────────────────────── */

    function test_runtimeSigner_isSetAfterInit() public view {
        assertEq(account.runtimeSigner(), signer);
    }

    function test_initialize_cannotBeCalledTwice() public {
        // ERC1967Proxy is already initialized — calling again should revert
        vm.expectRevert();
        account.initialize(wrongSigner);
    }

    /* ── Execute (via EntryPoint prank) ───────────────────────────── */

    function test_execute_fromEntryPoint() public {
        // Fund the account so it can send value
        vm.deal(address(account), 1 ether);

        vm.prank(ENTRY_POINT);
        account.execute(target, 0.5 ether, "");

        assertEq(target.balance, 0.5 ether);
    }

    function test_execute_fromSelf() public {
        vm.deal(address(account), 1 ether);

        // prank as the account itself
        vm.prank(address(account));
        account.execute(target, 0.1 ether, "");

        assertEq(target.balance, 0.1 ether);
    }

    function test_execute_revertsFromRandomCaller() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AgentAccount.OnlyEntryPointOrSelf.selector);
        account.execute(target, 0, "");
    }

    /* ── ExecuteBatch ─────────────────────────────────────────────── */

    function test_executeBatch() public {
        vm.deal(address(account), 2 ether);

        address[] memory targets = new address[](2);
        targets[0] = address(0xBEE1);
        targets[1] = address(0xBEE2);

        uint256[] memory values = new uint256[](2);
        values[0] = 0.5 ether;
        values[1] = 0.3 ether;

        bytes[] memory datas = new bytes[](2);
        datas[0] = "";
        datas[1] = "";

        vm.prank(ENTRY_POINT);
        account.executeBatch(targets, values, datas);

        assertEq(address(0xBEE1).balance, 0.5 ether);
        assertEq(address(0xBEE2).balance, 0.3 ether);
    }

    /* ── SetRuntimeSigner ─────────────────────────────────────────── */

    function test_setRuntimeSigner_fromEntryPoint() public {
        vm.prank(ENTRY_POINT);
        account.setRuntimeSigner(wrongSigner);

        assertEq(account.runtimeSigner(), wrongSigner);
    }

    function test_setRuntimeSigner_revertsZeroAddress() public {
        vm.prank(ENTRY_POINT);
        vm.expectRevert(AgentAccount.ZeroAddress.selector);
        account.setRuntimeSigner(address(0));
    }

    function test_setRuntimeSigner_revertsFromRandomCaller() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AgentAccount.OnlyEntryPointOrSelf.selector);
        account.setRuntimeSigner(wrongSigner);
    }

    /* ── Signature validation ─────────────────────────────────────── */

    function test_validateSignature_correctSigner() public {
        bytes32 userOpHash = keccak256("test");
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Build a minimal PackedUserOperation
        PackedUserOperation memory userOp = _buildUserOp(signature);

        // Call validateUserOp from the EntryPoint
        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);

        // 0 = SIG_VALIDATION_SUCCESS
        assertEq(validationData, 0, "Valid signer should return 0");
    }

    function test_validateSignature_wrongSigner() public {
        bytes32 userOpHash = keccak256("test");
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        PackedUserOperation memory userOp = _buildUserOp(signature);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);

        // 1 = SIG_VALIDATION_FAILED
        assertEq(validationData, 1, "Wrong signer should return 1");
    }

    /* ── Receive ETH ──────────────────────────────────────────────── */

    function test_receiveEth() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertTrue(ok, "Account should accept ETH");
        assertEq(address(account).balance, 1 ether);
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    function _buildUserOp(bytes memory signature) internal view returns (PackedUserOperation memory) {
        return PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: signature
        });
    }
}
