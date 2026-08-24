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
            if (isFatalUploadError(e)) {
                fatalErrors = extractFatalErrors(e);
            } else {
                handleError(e);
            }
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
            onActivate: onActivate
        });
    };

    const isFatalUploadError = (e: unknown): e is JSONError => {
        return e instanceof JSONError &&
            e.response?.status === 422 &&
            e.data?.errors !== undefined;
    };

    const extractFatalErrors = (e: JSONError): FatalErrors => {
        return e.data.errors as FatalErrors;
    };

    const showInvalidThemeModal = ({fatalErrors, onRetry}: {fatalErrors: FatalErrors; onRetry: () => void}) => {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
            fatalErrors,
            onRetry: async () => {
                modal?.remove();
                onRetry();
            }
        });
    };

    const buildUploadSuccessMessage = (theme: Theme): {title: string; prompt: React.ReactNode} => {
        if (theme.errors?.length || theme.warnings?.length) {
            const hasErrors = theme.errors?.length > 0;
            const issueType = hasErrors ? 'errors' : 'warnings';
            let title = `Upload successful with ${issueType}`;
            let prompt = <The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {issueType}.</>;

            if (!theme.active) {
                prompt = <>
                    {prompt}
                    You are still able to activate and use the theme but it is recommended to fix these {issueType} before you do so.
                </>;
            }

            return {title, prompt};
        }

        if (!theme.active) {
            return {
                title: 'Upload successful',
                prompt: <>
                    <strong>{theme.name}</strong> uploaded
                    {' '}
                    Do you want to activate it now?
                </>
            };
        }

        return {
            title: 'Upload successful',
            prompt: <>
                <strong>{theme.name}</strong> uploaded
            </>
        };
    };