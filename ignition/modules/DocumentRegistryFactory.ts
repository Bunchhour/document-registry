import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("DocumentRegistryFactoryModule", (m) => {
  const documentRegistryFactory = m.contract("DocumentRegistryFactory");
  return { documentRegistryFactory };
});
