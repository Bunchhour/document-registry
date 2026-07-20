import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("DocumentRegistryModule", (m) => {
  const owner = m.getAccount(0);
  const documentRegistry = m.contract("DocumentRegistry", [owner]);
  return { documentRegistry };
});
