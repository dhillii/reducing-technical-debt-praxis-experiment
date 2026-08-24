// only works on Windows
			if (os.platform() === "win32") {
				it(`should load the local config file with Windows slashes glob pattern`, async () => {
					await cli.execute(String.raw`cli\pass*.js --no-ignore`);
				});
			}