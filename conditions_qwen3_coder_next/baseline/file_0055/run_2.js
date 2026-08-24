console.log('Note that the development build is not optimized.');
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log(
    `To create a production build, use ` +
      `${chalk.cyan(`${buildCommand} build`)}.`
  );
  console.log();
}