console.log('Note that the development build is not optimized.');
const buildCommand = useYarn ? 'yarn build' : 'npm run build';
console.log(`To create a production build, use ${chalk.cyan(buildCommand)}.`);
console.log();