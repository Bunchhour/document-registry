import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("DocumentRegistryFactory", function () {
  async function deployFactoryFixture() {
    const [alice, bob] = await ethers.getSigners();
    const factory = await ethers.deployContract("DocumentRegistryFactory");
    return { factory, alice, bob };
  }

  it("creates, owns, and catalogs a registry for the caller", async function () {
    const { factory, alice } = await networkHelpers.loadFixture(deployFactoryFixture);

    await expect(factory.createRegistry("Alice documents", "ipfs://profile"))
      .to.emit(factory, "RegistryCreated");

    expect(await factory.registryCount()).to.equal(1n);
    const info = await factory.getRegistry(0n);
    const registry = await ethers.getContractAt("DocumentRegistry", info.registry);

    expect(info.creator).to.equal(alice.address);
    expect(info.name).to.equal("Alice documents");
    expect(await registry.owner()).to.equal(alice.address);
    expect(await factory.isCataloged(info.registry)).to.equal(true);
  });

  it("returns registry pages", async function () {
    const { factory } = await networkHelpers.loadFixture(deployFactoryFixture);
    await factory.createRegistry("One", "");
    await factory.createRegistry("Two", "");
    await factory.createRegistry("Three", "");

    const page = await factory.getRegistries(1n, 2n);
    expect(page).to.have.length(2);
    expect(page[0].name).to.equal("Two");
    expect(page[1].name).to.equal("Three");
  });

  it("lets only the current owner import a compatible registry", async function () {
    const { factory, alice, bob } = await networkHelpers.loadFixture(deployFactoryFixture);
    const registry = await ethers.deployContract("DocumentRegistry", [alice.address]);
    const address = await registry.getAddress();

    await expect(
      factory.connect(bob).importRegistry(address, "Existing", ""),
    ).to.be.revertedWith("Registry owner only");

    await expect(factory.importRegistry(address, "Existing", ""))
      .to.emit(factory, "RegistryImported");
    expect(await factory.registryCount()).to.equal(1n);
  });

  it("rejects duplicate catalog entries and invalid names", async function () {
    const { factory, alice } = await networkHelpers.loadFixture(deployFactoryFixture);
    const registry = await ethers.deployContract("DocumentRegistry", [alice.address]);
    const address = await registry.getAddress();

    await expect(factory.createRegistry("", "")).to.be.revertedWith("Registry name required");
    await factory.importRegistry(address, "Existing", "");
    await expect(factory.importRegistry(address, "Again", ""))
      .to.be.revertedWith("Registry already cataloged");
  });
});
