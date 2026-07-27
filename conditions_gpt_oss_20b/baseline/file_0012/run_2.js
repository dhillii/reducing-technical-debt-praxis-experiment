const handleThemeUpload = async ({
        file,
        onActivate
    }: {
        file: File;
        onActivate?: () => void
    }) => {
        setUploading(true);
        let data: ThemesInstallResponseType | undefined;
        let fatalErrors: FatalErrors | null = null;

        try {
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
            NiceModal.show(InvalidThemeModal, {
                title: 'Invalid Theme',
                prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
                fatalErrors,
                onRetry: async () => {
                    modal?.remove();
                    handleUpload();
                }
            });
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const isActive = uploadedTheme.active;
        const hasErrors = !!uploadedTheme.errors?.length;
        const hasWarnings = !!uploadedTheme.warnings?.length;

        let title = 'Upload successful';
        let prompt = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (!isActive) {
            prompt = <>
                {prompt} Do you want to activate it now?
            </>;
        }

        if (hasErrors || hasWarnings) {
            const issueType = hasErrors ? 'errors' : 'warnings';
            title = `Upload successful with ${issueType}`;
            prompt = <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {issueType}.
            </>;
            if (!isActive) {
                prompt = <>
                    {prompt}
                    You are still able to activate and use the theme but it is recommended to fix these {issueType} before you do so.
                </>;
            }
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
    };