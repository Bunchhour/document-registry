import { network } from "hardhat";
import { formatEther, getAddress, isAddress, parseEther } from "ethers";

const USAGE = `Usage:
  npm run fund:local -- --account <address> --amount <ETH>

Example:
  npm run fund:local -- --account 0x1234...abcd --amount 100`;

function readOption(args, name) {
  const optionIndex = args.indexOf(name);

  if (optionIndex !== -1) {
    const value = args[optionIndex + 1];
    return value && !value.startsWith("--") ? value : undefined;
  }

  const optionWithValue = args.find((arg) => arg.startsWith(`${name}=`));
  return optionWithValue?.slice(name.length + 1);
}

async function main() {
  const args = process.argv.slice(2);
  const accountInput = readOption(args, "--account");
  const amountInput = readOption(args, "--amount");

  if (!accountInput || !amountInput) {
    throw new Error(`Both --account and --amount are required.\n\n${USAGE}`);
  }

  if (!isAddress(accountInput)) {
    throw new Error(`Invalid account address: ${accountInput}`);
  }

  let amount;
  try {
    amount = parseEther(amountInput);
  } catch {
    throw new Error(`Invalid ETH amount: ${amountInput}`);
  }

  if (amount <= 0n) {
    throw new Error("--amount must be greater than zero.");
  }

  const { ethers, networkHelpers } = await network.create("localhost");

  const activeNetwork = await ethers.provider.getNetwork();
  if (activeNetwork.chainId !== 31337n) {
    throw new Error(
      `Refusing to modify chain ${activeNetwork.chainId}. Expected local Hardhat chain 31337.`
    );
  }

  const account = getAddress(accountInput);
  const currentBalanceHex = await ethers.provider.send("eth_getBalance", [account, "latest"]);
  const currentBalance = BigInt(currentBalanceHex);
  const newBalance = currentBalance + amount;

  await networkHelpers.setBalance(account, newBalance);
  await networkHelpers.mine();

  const confirmedBalanceHex = await ethers.provider.send("eth_getBalance", [account, "latest"]);
  const confirmedBalance = BigInt(confirmedBalanceHex);

  console.log(`Funded ${account} on Hardhat Local (chain 31337).`);
  console.log(`Added: ${formatEther(amount)} ETH`);
  console.log(`Previous balance: ${formatEther(currentBalance)} ETH`);
  console.log(`New balance: ${formatEther(confirmedBalance)} ETH`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to fund account: ${message}`);
  process.exitCode = 1;
});
