// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DocumentRegistry
/// @notice Stores a hash + metadata pointer for documents on-chain, so anyone
///         can later prove a given document existed at a given time.
contract DocumentRegistry {
    // ---------------------------------------------------------------------
    // State variables
    // ---------------------------------------------------------------------
    address public owner;
    uint256 public documentCount;

    struct Document {
        address uploader;
        string metadataURI; // e.g. an IPFS hash or description string
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Document) private documents;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event DocumentRegistered(bytes32 indexed docHash, address indexed uploader, uint256 timestamp);
    event DocumentRevoked(bytes32 indexed docHash, address indexed revokedBy);

    // ---------------------------------------------------------------------
    // Access control
    // ---------------------------------------------------------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: owner only");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Store function
    // ---------------------------------------------------------------------
    function registerDocument(bytes32 docHash, string calldata metadataURI) external {
        require(docHash != bytes32(0), "Invalid hash");
        require(!documents[docHash].exists, "Document already registered");
        require(bytes(metadataURI).length > 0, "Metadata URI required");

        documents[docHash] = Document({
            uploader: msg.sender,
            metadataURI: metadataURI,
            timestamp: block.timestamp,
            exists: true
        });

        documentCount += 1;
        emit DocumentRegistered(docHash, msg.sender, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Retrieve functions
    // ---------------------------------------------------------------------
    function getDocument(bytes32 docHash)
        external
        view
        returns (address uploader, string memory metadataURI, uint256 timestamp)
    {
        require(documents[docHash].exists, "Document not found");
        Document storage doc = documents[docHash];
        return (doc.uploader, doc.metadataURI, doc.timestamp);
    }

    function isRegistered(bytes32 docHash) external view returns (bool) {
        return documents[docHash].exists;
    }

    // ---------------------------------------------------------------------
    // Owner-only admin functions (access control)
    // ---------------------------------------------------------------------
    function revokeDocument(bytes32 docHash) external onlyOwner {
        require(documents[docHash].exists, "Document not found");
        delete documents[docHash];
        documentCount -= 1;
        emit DocumentRevoked(docHash, msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
