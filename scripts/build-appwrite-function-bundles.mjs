import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve('.');
const appwriteRoot = path.join(repoRoot, 'appwrite-functions');
const functionsRoot = path.join(repoRoot, 'functions');
const outputRoot = path.join(repoRoot, 'tmp', 'appwrite-function-bundles');

const functionIds = ['api', 'jobs'];

const ROOT_DEPENDENCY_OVERRIDES = {
  'node-appwrite': '^23.1.0',
};

const FUNCTION_COPY_EXCLUDES = new Set([
  'node_modules',
  '.env',
  '.env.example',
  '.env.local',
  '.env.omnicrystal',
  'package-lock.json',
]);

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function copyFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function copyDirectory(sourceDir, destinationDir, filter) {
  await fs.cp(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    filter,
  });
}

function createBundlePackageJson(basePackage, functionId) {
  return {
    name: `crystal-appwrite-${functionId}`,
    private: true,
    version: '1.0.0',
    dependencies: {
      ...(basePackage.dependencies || {}),
      ...ROOT_DEPENDENCY_OVERRIDES,
    },
  };
}

async function buildBundle(functionId, basePackage) {
  const sourceDir = path.join(appwriteRoot, functionId);
  const destinationDir = path.join(outputRoot, functionId);

  await ensureCleanDir(destinationDir);

  await copyFile(path.join(sourceDir, 'index.mjs'), path.join(destinationDir, 'index.mjs'));
  await copyFile(path.join(appwriteRoot, 'shared', 'crystal-runtime.mjs'), path.join(destinationDir, 'shared', 'crystal-runtime.mjs'));
  await copyFile(path.join(appwriteRoot, 'api', 'data-model.mjs'), path.join(destinationDir, 'data-model.mjs'));

  await copyDirectory(functionsRoot, path.join(destinationDir, 'functions'), (sourcePath) => {
    const name = path.basename(sourcePath);
    if (FUNCTION_COPY_EXCLUDES.has(name)) {
      return false;
    }
    return true;
  });

  const bundlePackage = createBundlePackageJson(basePackage, functionId);
  await fs.writeFile(path.join(destinationDir, 'package.json'), `${JSON.stringify(bundlePackage, null, 2)}\n`, 'utf8');

  return destinationDir;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const functionsPackage = await readJson(path.join(functionsRoot, 'package.json'));
  const builtBundles = [];

  for (const functionId of functionIds) {
    builtBundles.push({
      functionId,
      path: await buildBundle(functionId, functionsPackage),
    });
  }

  for (const bundle of builtBundles) {
    console.log(`[bundle] ${bundle.functionId} -> ${bundle.path}`);
  }
}

await main();
