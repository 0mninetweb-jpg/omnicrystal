import { spawn } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve('.');
const bundleRoot = path.join(repoRoot, 'tmp', 'appwrite-function-bundles');
const command = process.platform === 'win32' ? 'appwrite.cmd' : 'appwrite';
const deploymentTargets = [
  { functionId: 'api', bundleDir: path.join(bundleRoot, 'api') },
  { functionId: 'jobs', bundleDir: path.join(bundleRoot, 'jobs') },
];

function runCommand(binary, args, options = {}) {
  const { shell = false, ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const useCmdWrapper = process.platform === 'win32' && binary.toLowerCase().endsWith('.cmd');
    const quotedArgs = args.map((arg) => {
      if (!/[\s"]/u.test(arg)) return arg;
      return `"${String(arg).replace(/"/g, '\\"')}"`;
    });
    const spawnBinary = useCmdWrapper ? process.env.ComSpec || 'cmd.exe' : binary;
    const spawnArgs = useCmdWrapper ? ['/d', '/s', '/c', `${binary} ${quotedArgs.join(' ')}`] : args;

    const child = spawn(spawnBinary, spawnArgs, {
      stdio: 'inherit',
      shell: useCmdWrapper ? false : shell,
      ...spawnOptions,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${binary} ${args.join(' ')} exited with code ${code}.`));
    });
  });
}

async function main() {
  await runCommand(process.execPath, [path.join(repoRoot, 'scripts', 'build-appwrite-function-bundles.mjs')], {
    cwd: repoRoot,
    shell: false,
  });

  for (const target of deploymentTargets) {
    console.log(`[deploy] ${target.functionId} from ${target.bundleDir}`);
    await runCommand(
      command,
      [
        'functions',
        'create-deployment',
        '--function-id',
        target.functionId,
        '--code',
        target.bundleDir,
        '--activate',
        'true',
        '--entrypoint',
        'index.mjs',
      ],
      {
        cwd: repoRoot,
        shell: false,
      }
    );
  }
}

await main();
