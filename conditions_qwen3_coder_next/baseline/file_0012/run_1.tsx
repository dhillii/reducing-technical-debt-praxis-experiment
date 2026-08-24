const handleThemeUpload = async ({
        file,
        onActivate
    }: {
        file: File;
        onActivate?: () => void
    }) => {
        let data: ThemesInstallResponseType | undefined;
        let fatalErrors: FatalErrors | null = null;

        try {
            setUploading(true);
            data = await uploadTheme({file});
        } catch (e) {
            if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
                fatalErrors = e.data.errors as FatalErrors;
            } else {
                handleError(e);
            }
        } finally {
            setUploading(false);
        }

        if (fatalErrors && !data) {
            showInvalidThemeModal(fatalErrors);
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        showThemeInstalledModal(uploadedTheme, onActivate);
    };

    const showInvalidThemeModal = (fatalErrors: FatalErrors) => {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
            fatalErrors,
            onRetry: async () => {
                modal?.remove();
                handleUpload();
            }
        });
    };

    const showThemeInstalledModal = (uploadedTheme: Theme, onActivate?: () => void) => {
        let title = 'Upload successful';
        let prompt = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (!uploadedTheme.active) {
            prompt = (
                <>
                    {prompt}{' '}
                    Do you want to activate it now?
                </>
            );
        }

        if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
            const hasErrors = uploadedTheme?.errors?.length;

            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = (
                <>
                    The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
                </>
            );

            if (!uploadedTheme.active) {
                prompt = (
                    <>
                        {prompt}
                        You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                    </>
                );
            }
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
    };