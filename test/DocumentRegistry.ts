import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("DocumentRegistry", function () {
  async function deployRegistryFixture() {
    const [owner, other] = await ethers.getSigners();
    const registry = await ethers.deployContract("DocumentRegistry");
    return { registry, owner, other };
  }

  it("sets the deployer as owner", async function () {
    const { registry, owner } = await networkHelpers.loadFixture(deployRegistryFixture);
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("registers a document and stores its metadata", async function () {
    const { registry, owner } = await networkHelpers.loadFixture(deployRegistryFixture);
    const hash = ethers.keccak256(ethers.toUtf8Bytes("contract-v1"));
    await registry.registerDocument(hash, "ipfs://Qm123");

    const [uploader, uri] = await registry.getDocument(hash);
    expect(uploader).to.equal(owner.address);
    expect(uri).to.equal("ipfs://Qm123");
    expect(await registry.documentCount()).to.equal(1);
  });

  it("rejects duplicate registration (validation)", async function () {
    const { registry } = await networkHelpers.loadFixture(deployRegistryFixture);
    const hash = ethers.keccak256(ethers.toUtf8Bytes("contract-v1"));
    await registry.registerDocument(hash, "ipfs://Qm123");

    await expect(
      registry.registerDocument(hash, "ipfs://Qm456"),
    ).to.be.revertedWith("Document already registered");
  });

  it("blocks non-owners from revoking (access control)", async function () {
    const { registry, other } = await networkHelpers.loadFixture(deployRegistryFixture);
    const hash = ethers.keccak256(ethers.toUtf8Bytes("contract-v1"));
    await registry.registerDocument(hash, "ipfs://Qm123");

    await expect(
      registry.connect(other).revokeDocument(hash),
    ).to.be.revertedWith("Not authorized: owner only");
  });
});