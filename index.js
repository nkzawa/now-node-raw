const {
  createLambda,
  download,
  FileBlob,
  FileFsRef,
  glob,
  runNpmInstall,
  runPackageJsonScript,
  shouldServe
} = require('@now/build-utils');
const { readFileSync, realpathSync, statSync } = require('fs');
const { dirname, join, relative } = require('path');

function withErrorLog(fn) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch(err) {
      console.error(err);
      throw err;
    }
  }
}

async function resolveFiles(
  workPath,
  entrypoint,
  config = {}
) {
  const { resolve } = require('resolve-dependencies');

  // resolve symlink
  workPath = realpathSync(workPath);

  const resolved = await resolve(join(workPath, entrypoint));
  const resolvedFiles = {}

  for (const file of Object.values(resolved.files)) {
    const name = relative(workPath, file.absPath);
    if (resolvedFiles[name]) continue;

    const { mode } = statSync(file.absPath);
    resolvedFiles[name] = new FileBlob({ data: file.contents, mode });
  }

  if (config.includeFiles) {
    const includeFiles =
      typeof config.includeFiles === 'string'
        ? [config.includeFiles]
        : config.includeFiles;

    for (const pattern of includeFiles) {
      const files = await glob(pattern, workPath);

      for (const [name, file] of Object.entries(files)) {
        if (resolvedFiles[name]) continue;
        resolvedFiles[name] = file;
      }
    }
  }

  return resolvedFiles;
}

exports.config = {
  maxLambdaSize: '5mb'
};

exports.build = withErrorLog(async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta,
}) {
  console.log('downloading...');
  await download(files, workPath, meta);

  const entrypointDir = join(workPath, dirname(entrypoint));

  console.log('installing dependencies...');
  await runNpmInstall(entrypointDir, ['--prefer-offline']);

  console.log('executing now-build script...');
  await runPackageJsonScript(entrypointDir, 'now-build');

  console.log('resolving...');
  const resolvedFiles = await resolveFiles(workPath, entrypoint, config);

  console.log('creating lambda...');
  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = readFileSync(launcherPath, 'utf8');

  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    [
      `handler = require("./${entrypoint}");`,
      'if (handler.default) handler = handler.default;',
    ].join(' ')
  );

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') })
  };

  const lambda = await createLambda({
    files: {
      ...resolvedFiles,
      ...launcherFiles
    },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10'
  });

  return { [entrypoint]: lambda };
});

exports.prepareCache = async function prepareCache({ workPath }) {
  return {
    ...await glob('**/node_modules/**', workPath),
    ...await glob('**/package-lock.json', workPath),
    ...await glob('**/yarn.lock', workPath)
  };
};

exports.shouldServe = shouldServe;
