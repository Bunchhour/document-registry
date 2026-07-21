// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DocumentRegistry} from "./DocumentRegistry.sol";

interface IOwnedDocumentRegistry {
    function owner() external view returns (address);
    function documentCount() external view returns (uint256);
}

/// @title DocumentRegistryFactory
/// @notice Creates and catalogs DocumentRegistry instances so clients can
///         discover registries without relying on a centralized database.
contract DocumentRegistryFactory {
    struct RegistryInfo {
        address registry;
        address creator;
        string name;
        string metadataURI;
        uint256 createdAt;
    }

    RegistryInfo[] private registries;
    mapping(address => bool) public isCataloged;

    event RegistryCreated(
        address indexed registry,
        address indexed creator,
        string name,
        string metadataURI,
        uint256 timestamp
    );
    event RegistryImported(
        address indexed registry,
        address indexed importer,
        string name,
        string metadataURI,
        uint256 timestamp
    );

    function createRegistry(string calldata name, string calldata metadataURI)
        external
        returns (address registryAddress)
    {
        _validateName(name);
        DocumentRegistry registry = new DocumentRegistry(msg.sender);
        registryAddress = address(registry);
        _catalog(registryAddress, msg.sender, name, metadataURI);
        emit RegistryCreated(registryAddress, msg.sender, name, metadataURI, block.timestamp);
    }

    /// @notice Adds a compatible, previously deployed registry to the catalog.
    ///         Only its current owner may import it.
    function importRegistry(address registry, string calldata name, string calldata metadataURI) external {
        _validateName(name);
        require(registry.code.length > 0, "Registry must be a contract");
        require(!isCataloged[registry], "Registry already cataloged");
        require(IOwnedDocumentRegistry(registry).owner() == msg.sender, "Registry owner only");

        // Confirm that the expected read interface is present.
        IOwnedDocumentRegistry(registry).documentCount();

        _catalog(registry, msg.sender, name, metadataURI);
        emit RegistryImported(registry, msg.sender, name, metadataURI, block.timestamp);
    }

    function registryCount() external view returns (uint256) {
        return registries.length;
    }

    function getRegistry(uint256 index) external view returns (RegistryInfo memory) {
        require(index < registries.length, "Registry index out of bounds");
        return registries[index];
    }

    function getRegistries(uint256 offset, uint256 limit) external view returns (RegistryInfo[] memory page) {
        if (offset >= registries.length || limit == 0) {
            return new RegistryInfo[](0);
        }

        uint256 end = offset + limit;
        if (end > registries.length) end = registries.length;

        page = new RegistryInfo[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = registries[i];
        }
    }

    function _catalog(address registry, address creator, string calldata name, string calldata metadataURI) private {
        isCataloged[registry] = true;
        registries.push(RegistryInfo({
            registry: registry,
            creator: creator,
            name: name,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        }));
    }

    function _validateName(string calldata name) private pure {
        uint256 length = bytes(name).length;
        require(length > 0, "Registry name required");
        require(length <= 80, "Registry name too long");
    }
}
