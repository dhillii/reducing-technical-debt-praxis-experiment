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
            fatalErrors = extractFatalErrors(e);
        } finally {
            setUploading(false);
        }

        if (fatalErrors && !data) {
            showInvalidThemeModal({fatalErrors, onRetry: handleUpload});
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {title, prompt} = buildUploadSuccessMessage(uploadedTheme);

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
    };

    const extractFatalErrors = (e: unknown): FatalErrors | null => {
        if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
            return e.data.errors as FatalErrors;
        }
        handleError(e);
        return null;
    };

    const showInvalidThemeModal = ({fatalErrors, onRetry}: {fatalErrors: FatalErrors; onRetry: () => void}) => {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
            fatalErrors,
            onRetry
        });
    };

    const buildUploadSuccessMessage = (theme: ThemesInstallResponseType['themes'][0]) => {
        let title = 'Upload successful';
        let prompt = <><strong>{theme.name}</strong> uploaded</>;

        if (!theme.active) {
            prompt = (
                <>
                    {prompt}{' '}
                    Do you want to activate it now?
                </>
            );
        }

        if (theme.errors?.length || theme.warnings?.length) {
            const hasErrors = theme.errors?.length;
            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = (
                <>
                    The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
                </>
            );

            if (!theme.active) {
                prompt = (
                    <>
                        {prompt}
                        You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                    </>
                );
            }
        }

        return {title, prompt};
    };