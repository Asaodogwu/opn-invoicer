const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  OPN Invoicer — Deploying to OPN Chain");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Deployer : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance  : ${ethers.formatEther(balance)} OPN`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Deploy
  const OPNInvoicer = await ethers.getContractFactory("OPNInvoicer");
  console.log("Deploying OPNInvoicer...");
  const contract = await OPNInvoicer.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ OPNInvoicer deployed!`);
  console.log(`   Contract address : ${address}`);
  console.log(`   Explorer         : https://testnet.iopn.tech/address/${address}`);
  console.log(`   Owner            : ${deployer.address}`);
  console.log(`   Platform fee     : 0.5% (50 bps)\n`);

  // Quick smoke test
  console.log("Running post-deploy checks...");
  const owner = await contract.owner();
  const fee   = await contract.platformFeeBps();
  const total = await contract.totalInvoices();
  console.log(`   owner()          : ${owner}`);
  console.log(`   platformFeeBps() : ${fee.toString()} (${Number(fee)/100}%)`);
  console.log(`   totalInvoices()  : ${total.toString()}`);
  console.log("\n🚀 All checks passed. Ready to receive invoices!\n");

  // Save deployment info
  const info = {
    network:    "OPN Chain Testnet",
    chainId:    984,
    contract:   address,
    deployer:   deployer.address,
    deployedAt: new Date().toISOString(),
    explorer:   `https://testnet.iopn.tech/address/${address}`,
  };

  const fs = require("fs");
  fs.writeFileSync(
    "./deployment.json",
    JSON.stringify(info, null, 2)
  );
  console.log("📄 Deployment info saved to deployment.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
