import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const destDir = path.join(__dirname, '../frontend/src/contracts');
const artifacts = [
  ['DocumentRegistry.sol', 'DocumentRegistry.json'],
  ['DocumentRegistryFactory.sol', 'DocumentRegistryFactory.json'],
];

try {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const [sourceDir, artifact] of artifacts) {
    const source = path.join(__dirname, `../artifacts/contracts/${sourceDir}/${artifact}`);
    const dest = path.join(destDir, artifact);
    if (!fs.existsSync(source)) {
      console.error(`Error: Source artifact not found at ${source}. Run 'npx hardhat compile' first.`);
      process.exit(1);
    }
    fs.copyFileSync(source, dest);
    console.log(`Successfully copied ABI artifact to ${dest}`);
  }
} catch (error) {
  console.error('Failed to copy ABI artifact:', error);
  process.exit(1);
}
