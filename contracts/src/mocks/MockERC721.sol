// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MockERC721 — Testnet NFT with public minting
/// @notice Used for NftEscrow testing. NOT for production use.
contract MockERC721 is ERC721 {
    constructor() ERC721("Mock NFT", "MNFT") {}

    /// @notice Mint a token to any address (testnet only, no access control)
    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}
