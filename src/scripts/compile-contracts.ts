import { compileStellarisEscrow } from '../contracts/compile.js';

const artifact = compileStellarisEscrow();

console.log(JSON.stringify({
  compiled: true,
  artifactPath: artifact.artifactPath
}, null, 2));
