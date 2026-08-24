const handleThemeUpload = async ({
        file,
        onActivate
    }: {
        file: File;
        onActivate?: () => void
    }) => {
        const uploadResult = await tryUploadTheme(setUploading, uploadTheme, file);

        if (uploadResult.fatalErrors && !uploadResult.data) {
            showInvalidThemeModal(modal, uploadResult.fatalErrors);
            return;
        }

        if (!uploadResult.data) {
            return;
        }

        const uploadedTheme = uploadResult.data.themes[0];
        const installationDetails = getInstallationDetails(uploadedTheme);
        NiceModal.show(ThemeInstalledModal, {
            title: installationDetails.title,
            prompt: installationDetails.prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
    };

    const tryUploadTheme = async (
        setLoading: React.Dispatch<React.SetStateAction<boolean>>,
        uploadThemeFn: (args: { file: File }) => Promise<ThemesInstallResponseType>,
        file: File
    ): Promise<{ data?: ThemesInstallResponseType; fatalErrors?: FatalErrors }> => {
        try {
            setLoading(true);
            const data = await uploadThemeFn({file});
            setLoading(false);
            return { data };
        } catch (e) {
            setLoading(false);

            if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
                return { fatalErrors: e.data.errors as FatalErrors };
            } else {
                handleError(e);
                return {};
            }
        }
    };

    const showInvalidThemeModal = (modalHandler: NiceModalHandler<Record<string, unknown>>, fatalErrors: FatalErrors) => {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: 'This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme',
            fatalErrors,
            onRetry: async () => {
                modalHandler?.remove();
                handleUpload();
            }
        });
    };

    const getInstallationDetails = (theme: InstalledTheme | Theme): { title: string; prompt: React.ReactNode } => {
        const base = <><strong>{theme.name}</strong> uploaded</>;
        const baseDetails = { title: 'Upload successful', prompt: base };

        if (theme.errors?.length || theme.warnings?.length) {
            const hasErrors = theme.errors?.length;
            const severity = hasErrors ? 'errors' : 'warnings';
            const title = `Upload successful with ${severity}`;
            const prompt = (
                <>
                    The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {severity}.
                    {theme.active ? '' : (
                        <>
                            You are still able to activate and use the theme but it is recommended to fix these {severity} before you do so.
                        </>
                    )}
                </>
            );
            return { title, prompt };
        }

        if (!theme.active) {
            return {
                title: 'Upload successful',
                prompt: (
                    <>
                        {base}{' '}
                        Do you want to activate it now?
                    </>
                )
            };
        }

        return baseDetails;
    };