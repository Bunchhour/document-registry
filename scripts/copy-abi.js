import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.join(__dirname, '../artifacts/contracts/DocumentRegistry.sol/DocumentRegistry.json');
const destDir = path.join(__dirname, '../frontend/src/contracts');
const dest = path.join(destDir, 'DocumentRegistry.json');

try {
  if (!fs.existsSync(source)) {
    console.error(`Error: Source artifact not found at ${source}. Run 'npx hardhat compile' first.`);
    process.exit(1);
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.copyFileSync(source, dest);
  console.log(`Successfully copied ABI artifact to ${dest}`);
} catch (error) {
  console.error('Failed to copy ABI artifact:', error);
  process.exit(1);
}
