console.log('Note that the development build is not optimized.');
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  const coloredBuildCommand = chalk.cyan(`${buildCommand} build`);
  console.log(`To create a production build, use ${coloredBuildCommand}.`);
  console.log();