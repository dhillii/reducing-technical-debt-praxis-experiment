describe("when there is a local config file", () => {
    const originalCwd = process.cwd;

    beforeEach(() => {
        process.cwd = () => getFixturePath();
    });

    afterEach(() => {
        process.cwd = originalCwd;
    });

    it(`should load the local config file`, async () => {
        await cli.execute("cli/passing.js --no-ignore");
    });

    it(`should load the local config file with glob pattern`, async () => {
        await cli.execute("cli/pass*.js --no-ignore");
    });

    // only works on Windows
    if (os.platform() === "win32") {
        it(`should load the local config file with Windows slashes glob pattern`, async () => {
            // Use String.raw to avoid escaping backslashes
            const windowsSlashesGlobPattern = String.raw`cli\pass*.js`;
            await cli.execute(`${windowsSlashesGlobPattern} --no-ignore`);
        });
    }
});