import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("DocumentRegistryModule", (m) => {
  const documentRegistry = m.contract("DocumentRegistry");
  return { documentRegistry };
});
