import { network } from "hardhat";

async function main() {
  const { ethers } = await network.create();
  const registry = await ethers.deployContract("DocumentRegistry");
  await registry.waitForDeployment();

  console.log("DocumentRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
