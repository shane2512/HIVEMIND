require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

const rpcUrl = process.env.HEDERA_JSON_RPC_URL || "https://testnet.hashio.io/api";
const privateKey = process.env.HEDERA_EVM_PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hedera_testnet: {
      url: rpcUrl,
      chainId: 296,
      accounts: privateKey ? [privateKey] : []
    }
  }
};