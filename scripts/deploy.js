import { network } from "hardhat";

async function main() {
  const { ethers } = await network.create();
  const [owner] = await ethers.getSigners();
  const registry = await ethers.deployContract("DocumentRegistry", [owner.address]);
  await registry.waitForDeployment();

  console.log("DocumentRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
