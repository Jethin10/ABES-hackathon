import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import solc from 'solc';

const contractSourcePath = resolve('contracts/src/StellarisEscrow.sol');
const artifactOutputPath = resolve('contracts/artifacts/StellarisEscrow.json');

export const compileStellarisEscrow = () => {
  const source = readFileSync(contractSourcePath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'StellarisEscrow.sol': {
        content: source
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts?: Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>>;
  };

  const errors = output.errors?.filter((entry) => entry.severity === 'error') ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  }

  const artifact = output.contracts?.['StellarisEscrow.sol']?.StellarisEscrow;
  if (!artifact) {
    throw new Error('Compiled artifact for StellarisEscrow was not produced.');
  }

  mkdirSync(dirname(artifactOutputPath), { recursive: true });
  writeFileSync(
    artifactOutputPath,
    JSON.stringify(
      {
        contractName: 'StellarisEscrow',
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`
      },
      null,
      2
    )
  );

  return {
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    artifactPath: artifactOutputPath
  };
};
