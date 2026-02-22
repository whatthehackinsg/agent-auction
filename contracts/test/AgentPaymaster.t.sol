// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/interfaces/PackedUserOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentPaymaster, IERC8004Registry, IAuctionEscrowBonds} from "../src/AgentPaymaster.sol";
import {IPaymaster} from "@account-abstraction/interfaces/IPaymaster.sol";

/// @dev Minimal mock ERC-8004 identity registry
contract MockIdentityRegistry {
    mapping(uint256 => address) public owners;

    function setOwner(uint256 agentId, address owner_) external {
        owners[agentId] = owner_;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return owners[agentId];
    }
}

/// @dev Minimal mock escrow for bond lookup
contract MockEscrowBonds {
    mapping(bytes32 => mapping(uint256 => uint256)) public bondAmounts;

    function setBond(bytes32 auctionId, uint256 agentId, uint256 amount) external {
        bondAmounts[auctionId][agentId] = amount;
    }

    function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256) {
        return bondAmounts[auctionId][agentId];
    }
}

/// @dev Minimal mock USDC (just needs address)
contract MockUSDCToken {
    // Enough to be a valid contract at this address
    function dummy() external pure returns (bool) {
        return true;
    }
}


/// @dev Mock EntryPoint that responds to supportsInterface
contract MockEntryPoint {
    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }
    // BasePaymaster also calls some IStakeManager functions during addStake etc.
    // For tests we just need construction + validatePaymasterUserOp to not revert.
    fallback() external payable {}
    receive() external payable {}
}

contract AgentPaymasterTest is Test {
    AgentPaymaster paymaster;
    MockIdentityRegistry identityRegistry;
    MockEscrowBonds mockEscrow;
    MockUSDCToken usdc;
    MockEntryPoint mockEntryPoint;
    address agentAccount = address(0x3333333333333333333333333333333333333333);
    uint256 agentId = 42;
    bytes32 auctionId = keccak256("auction-1");

    function setUp() public {
        mockEntryPoint = new MockEntryPoint();
        usdc = new MockUSDCToken();
        identityRegistry = new MockIdentityRegistry();
        mockEscrow = new MockEscrowBonds();
        paymaster = new AgentPaymaster(
            IEntryPoint(address(mockEntryPoint)),
            IERC20(address(usdc)),
            IERC8004Registry(address(identityRegistry))
        );

        // Set escrow
        paymaster.setEscrow(address(mockEscrow));

        // Register agent
        paymaster.registerAgent(agentAccount, agentId);

        // Set agent identity in registry
        identityRegistry.setOwner(agentId, agentAccount);
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    /// @dev Build a UserOp that encodes AgentAccount.execute(target, 0, innerData)
    function _buildBondDepositUserOp() internal view returns (PackedUserOperation memory) {
        // Inner call: USDC.transfer(escrow, 100e6)
        bytes memory innerData = abi.encodeWithSelector(
            bytes4(0xa9059cbb), // transfer(address,uint256)
            address(mockEscrow),
            100e6
        );

        // Outer call: AgentAccount.execute(usdc, 0, innerData)
        bytes memory callData = abi.encodeWithSelector(
            bytes4(0xb61d27f6), // execute(address,uint256,bytes)
            address(usdc),
            0,
            innerData
        );

        // paymasterAndData: [20 bytes paymaster][16 bytes gas][paymaster data]
        // For bond deposit path, no extra paymaster data needed beyond the base 52 bytes
        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            bytes16(0), // gas limits placeholder
            bytes16(0)  // gas limits placeholder
        );

        return PackedUserOperation({
            sender: agentAccount,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: paymasterAndData,
            signature: ""
        });
    }

    /// @dev Build a UserOp for non-bond operation (e.g., execute some other call)
    function _buildNonBondUserOp(bytes32 _auctionId) internal view returns (PackedUserOperation memory) {
        // Inner call: some random function (not USDC.transfer)
        bytes memory innerData = abi.encodeWithSelector(bytes4(0xdeadbeef), uint256(1));

        // Outer call: AgentAccount.execute(someTarget, 0, innerData)
        bytes memory callData = abi.encodeWithSelector(
            bytes4(0xb61d27f6), // execute(address,uint256,bytes)
            address(0xCAFE),
            0,
            innerData
        );

        // paymasterAndData with auctionId after PAYMASTER_DATA_OFFSET (52 bytes)
        // 20 bytes paymaster + 16 bytes gas + 16 bytes gas = 52 bytes, then auctionId
        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            bytes16(0),
            bytes16(0),
            _auctionId
        );

        return PackedUserOperation({
            sender: agentAccount,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: paymasterAndData,
            signature: ""
        });
    }

    /* ── Admin setters ────────────────────────────────────────────── */

    function test_setEscrow() public {
        address newEscrow = address(0xE5C);
        paymaster.setEscrow(newEscrow);
        assertEq(address(paymaster.escrow()), newEscrow);
    }

    function test_registerAgent() public {
        address newAgent = address(0xA222222222222222222222222222222222222222);
        paymaster.registerAgent(newAgent, 99);
        assertEq(paymaster.accountToAgentId(newAgent), 99);
    }

    function test_setEscrow_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        paymaster.setEscrow(address(0xABC));
    }

    function test_registerAgent_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        paymaster.registerAgent(address(0xABC), 1);
    }

    /* ── Bond deposit path ────────────────────────────────────────── */

    function test_validatePaymasterUserOp_bondDeposit_success() public {
        PackedUserOperation memory userOp = _buildBondDepositUserOp();

        // Call validatePaymasterUserOp through the entry point
        // BasePaymaster.validatePaymasterUserOp calls _validatePaymasterUserOp internally
        vm.prank(address(mockEntryPoint));
        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);

        assertEq(validationData, 0, "Bond deposit should pass validation");
        // Context should encode the sender
        address decodedSender = abi.decode(context, (address));
        assertEq(decodedSender, agentAccount);
    }

    function test_validatePaymasterUserOp_bondDeposit_revertsUnregisteredAgent() public {
        // Unregistered agent (agentId 0)
        address unknownAgent = address(0x5555555555555555555555555555555555555555);
        PackedUserOperation memory userOp = _buildBondDepositUserOp();
        userOp.sender = unknownAgent;

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.AgentIdNotMapped.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    function test_validatePaymasterUserOp_bondDeposit_revertsIfTransferNotToEscrow() public {
        // Build a USDC transfer to wrong address (not escrow)
        bytes memory innerData = abi.encodeWithSelector(
            bytes4(0xa9059cbb),
            address(0xBAD), // not the escrow
            100e6
        );

        bytes memory callData = abi.encodeWithSelector(
            bytes4(0xb61d27f6),
            address(usdc),
            0,
            innerData
        );

        bytes memory paymasterAndData = abi.encodePacked(address(paymaster), bytes16(0), bytes16(0));

        PackedUserOperation memory userOp = PackedUserOperation({
            sender: agentAccount,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: paymasterAndData,
            signature: ""
        });

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.TransferMustTargetEscrow.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    function test_validatePaymasterUserOp_bondDeposit_revertsIfNotERC8004Registered() public {
        // Clear the identity registry entry
        identityRegistry.setOwner(agentId, address(0));

        PackedUserOperation memory userOp = _buildBondDepositUserOp();

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.AgentNotRegistered.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    /* ── Non-bond operation path ──────────────────────────────────── */

    function test_validatePaymasterUserOp_nonBond_withBond() public {
        // Set up a bond for this agent
        mockEscrow.setBond(auctionId, agentId, 100e6);

        PackedUserOperation memory userOp = _buildNonBondUserOp(auctionId);

        vm.prank(address(mockEntryPoint));
        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);

        assertEq(validationData, 0, "Non-bond op with bond should pass");
        address decodedSender = abi.decode(context, (address));
        assertEq(decodedSender, agentAccount);
    }

    function test_validatePaymasterUserOp_nonBond_revertsWithoutBond() public {
        // No bond set
        PackedUserOperation memory userOp = _buildNonBondUserOp(auctionId);

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.InsufficientBond.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    function test_validatePaymasterUserOp_nonBond_revertsShortPaymasterData() public {
        // Build a non-bond op but with paymasterAndData too short (missing auctionId)
        bytes memory innerData = abi.encodeWithSelector(bytes4(0xdeadbeef), uint256(1));
        bytes memory callData = abi.encodeWithSelector(
            bytes4(0xb61d27f6),
            address(0xCAFE),
            0,
            innerData
        );

        // Only 52 bytes (no auctionId appended)
        bytes memory paymasterAndData = abi.encodePacked(address(paymaster), bytes16(0), bytes16(0));

        PackedUserOperation memory userOp = PackedUserOperation({
            sender: agentAccount,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: paymasterAndData,
            signature: ""
        });

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.UnsupportedOperation.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    /* ── Unsupported selectors ────────────────────────────────────── */

    function test_validatePaymasterUserOp_revertsNonExecuteSelector() public {
        // callData with wrong outer selector (not 0xb61d27f6)
        bytes memory callData = abi.encodeWithSelector(bytes4(0x12345678), uint256(1));

        bytes memory paymasterAndData = abi.encodePacked(address(paymaster), bytes16(0), bytes16(0));

        PackedUserOperation memory userOp = PackedUserOperation({
            sender: agentAccount,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: paymasterAndData,
            signature: ""
        });

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.UnsupportedOperation.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    function test_validatePaymasterUserOp_revertsEmptyCallData() public {
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: agentAccount,
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: abi.encodePacked(address(paymaster), bytes16(0), bytes16(0)),
            signature: ""
        });

        vm.prank(address(mockEntryPoint));
        vm.expectRevert(AgentPaymaster.UnsupportedOperation.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 0);
    }

    /* ── postOp ───────────────────────────────────────────────────── */

    function test_postOp_emitsGasSponsored() public {
        bytes memory context = abi.encode(agentAccount);

        vm.prank(address(mockEntryPoint));
        vm.expectEmit(true, false, false, true);
        emit AgentPaymaster.GasSponsored(agentAccount, 21000);
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, context, 21000, 1);
    }
}
