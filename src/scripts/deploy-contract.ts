import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { compileStellarisEscrow } from '../contracts/compile.js';
import { env } from '../config/env.js';

if (!env.ESCROW_RPC_URL || !env.ESCROW_ADMIN_PRIVATE_KEY) {
  throw new Error('ESCROW_RPC_URL and ESCROW_ADMIN_PRIVATE_KEY are required to deploy the escrow contract.');
}

const artifact = compileStellarisEscrow();
const chain = {
  id: env.ESCROW_CHAIN_ID,
  name: `stellaris-${env.ESCROW_CHAIN_ID}`,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [env.ESCROW_RPC_URL]
    }
  }
};

const account = privateKeyToAccount(env.ESCROW_ADMIN_PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(env.ESCROW_RPC_URL)
});
const publicClient = createPublicClient({
  chain,
  transport: http(env.ESCROW_RPC_URL)
});

const hash = await walletClient.deployContract({
  abi: artifact.abi as [],
  bytecode: artifact.bytecode as `0x${string}`
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });

console.log(JSON.stringify({
  deployed: true,
  transactionHash: hash,
  contractAddress: receipt.contractAddress
}, null, 2));
