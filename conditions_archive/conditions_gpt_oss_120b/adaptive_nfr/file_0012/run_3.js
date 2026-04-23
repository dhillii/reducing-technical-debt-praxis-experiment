import AdvancedThemeSettings from './theme/advanced-theme-settings';
import InvalidThemeModal, {type FatalErrors} from './theme/invalid-theme-modal';
import NiceModal, {type NiceModalHandler, useModal} from '@ebay/nice-modal-react';
import OfficialThemes from './theme/official-themes';
import React, {useEffect, useState} from 'react';
import ThemeInstalledModal from './theme/theme-installed-modal';
import ThemePreview from './theme/theme-preview';
import {Button, ConfirmationModal, FileUpload, LimitModal, Modal, PageHeader, TabView, showToast} from '@tryghost/admin-x-design-system';
import {
    type InstalledTheme,
    type Theme,
    type ThemesInstallResponseType,
    isDefaultOrLegacyTheme,
    useActivateTheme,
    useBrowseThemes,
    useInstallTheme,
    useUploadTheme
} from '@tryghost/admin-x-framework/api/themes';
import {JSONError} from '@tryghost/admin-x-framework/errors';
import {type OfficialTheme} from '../../providers/settings-app-provider';
import {useCheckThemeLimitError} from '../../../hooks/use-check-theme-limit-error';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import {useRouting} from '@tryghost/admin-x-framework/routing';

/**
 * Checks whether a theme name conflicts with a default or legacy theme.
 */
function isDefaultOrLegacy(themeName: string): boolean {
    return isDefaultOrLegacyTheme({name: themeName});
}

/**
 * Determines if a theme with the given name already exists in the provided list.
 */
function doesThemeExist(themeName: string, themes: Theme[]): boolean {
    return themes.some(t => t.name.toLowerCase() === themeName.toLowerCase());
}

/**
 * Returns a list of theme names in lower‑case form.
 */
function getExistingThemeNames(themes: Theme[]): string[] {
    return themes.map(t => t.name.toLowerCase());
}

/**
 * Shows a confirmation modal for default/legacy theme upload attempts.
 */
function showDefaultThemeUploadError(themeName: string): void {
    NiceModal.show(ConfirmationModal, {
        title: 'Upload failed',
        cancelLabel: 'Cancel',
        okLabel: '',
        prompt: (
            <>
                <p>The default <strong>{themeName}</strong> theme cannot be overwritten.</p>
                <p>Rename your zip file and try again.</p>
            </>
        ),
        onOk: (confirmModal) => {
            confirmModal?.remove();
        }
    });
}

/**
 * Shows a confirmation modal when a theme already exists.
 */
function showOverwriteConfirmation(
    themeName: string,
    onConfirm: () => Promise<void>
): void {
    NiceModal.show(ConfirmationModal, {
        title: 'Overwrite theme',
        prompt: (
            <>
                The theme <strong>{themeName}</strong> already exists.
                Do you want to overwrite it?
            </>
        ),
        okLabel: 'Overwrite',
        cancelLabel: 'Cancel',
        okRunningLabel: 'Overwriting...',
        okColor: 'red',
        onOk: async (confirmModal) => {
            await onConfirm();
            confirmModal?.remove();
        }
    });
}

/**
 * Shows a modal when the theme upload limit has been reached.
 */
function showUploadLimitModal(errorMessage: string, updateRoute: (opts: {route: string; isExternal?: boolean}) => void): void {
    NiceModal.show(LimitModal, {
        title: 'Upgrade to enable custom themes',
        prompt: errorMessage,
        onOk: () => updateRoute({route: '/pro', isExternal: true})
    });
}

/**
 * Builds the title and prompt for a successful upload.
 */
function buildSuccessMessage(uploadedTheme: Theme): {title: string; prompt: JSX.Element} {
    let title = 'Upload successful';
    let prompt = (
        <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>
    );

    if (!uploadedTheme.active) {
        prompt = (
            <>
                {prompt}{' '}
                Do you want to activate it now?
            </>
        );
    }

    const hasErrors = !!uploadedTheme.errors?.length;
    const hasWarnings = !!uploadedTheme.warnings?.length;

    if (hasErrors || hasWarnings) {
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

    return {title, prompt};
}

/**
 * Handles the upload of a theme file.
 */
async function uploadThemeFile(
    file: File,
    uploadTheme: (params: {file: File}) => Promise<ThemesInstallResponseType>,
    handleError: (e: unknown) => void,
    setUploading: (val: boolean) => void
): Promise<{data?: ThemesInstallResponseType; fatalErrors?: FatalErrors | null}> {
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

    return {data, fatalErrors};
}

/**
 * Shows the modal for an invalid theme.
 */
function showInvalidThemeModal(
    fatalErrors: FatalErrors,
    onRetry: () => void,
    modal: NiceModalHandler<Record<string, unknown>>
): void {
    NiceModal.show(InvalidThemeModal, {
        title: 'Invalid Theme',
        prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re‑upload the theme</>,
        fatalErrors,
        onRetry: async () => {
            modal?.remove();
            onRetry();
        }
    });
}

/**
 * Shows the final modal after a theme has been uploaded.
 */
function showThemeInstalledModal(
    title: string,
    prompt: JSX.Element,
    installedTheme: Theme,
    onActivate?: () => void
): void {
    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme,
        onActivate
    });
}

/**
 * Upload modal content component.
 */
const UploadModalContent: React.FC<{onUpload: (file: File) => void}> = ({onUpload}) => {
    const modal = useModal();

    return (
        <div className="-mb-6">
            <FileUpload
                id="theme-upload"
                onUpload={(file) => {
                    modal.remove();
                    onUpload(file);
                }}
            >
                <div className="cursor-pointer bg-grey-75 p-10 text-center dark:bg-grey-950">
                    Click to select or drag &amp; drop zip file
                </div>
            </FileUpload>
        </div>
    );
};

/**
 * Toolbar component for theme actions.
 */
const ThemeToolbar: React.FC<ThemeToolbarProps> = ({
    currentTab,
    setCurrentTab,
    themes
}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {mutateAsync: uploadTheme} = useUploadTheme();
    const {checkThemeLimitError, isThemeLimited} = useCheckThemeLimitError();
    const handleError = useHandleError();

    const [uploadConfig, setUploadConfig] = useState<{enabled: boolean; error?: string} | undefined>();
    const [isUploading, setUploading] = useState(false);

    useEffect(() => {
        const checkUploadLimit = async () => {
            if (isThemeLimited) {
                const error = await checkThemeLimitError('.');
                setUploadConfig({enabled: false, error: error || "Your current plan doesn't support uploading custom themes."});
            } else {
                setUploadConfig({enabled: true});
            }
        };
        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    const onClose = () => {
        updateRoute('/');
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/i, '');
        const lowerCaseName = themeFileName.toLowerCase();

        if (isDefaultOrLegacy(themeFileName)) {
            showDefaultThemeUploadError(themeFileName);
            return;
        }

        if (doesThemeExist(lowerCaseName, themes)) {
            const existingNames = getExistingThemeNames(themes);
            const index = existingNames.indexOf(lowerCaseName);
            const overwriteHandler = async () => {
                setUploading(true);
                themes.splice(index, 1);
                await handleThemeUpload({file, onActivate: onClose});
                setUploading(false);
                setCurrentTab('installed');
            };
            showOverwriteConfirmation(themeFileName, overwriteHandler);
            return;
        }

        setCurrentTab('installed');
        await handleThemeUpload({file, onActivate: onClose});
    };

    const handleThemeUpload = async ({
        file,
        onActivate
    }: {
        file: File;
        onActivate?: () => void;
    }) => {
        const {data, fatalErrors} = await uploadThemeFile(file, uploadTheme, handleError, setUploading);

        if (fatalErrors && !data) {
            showInvalidThemeModal(fatalErrors, () => {
                modal?.remove();
                handleUpload();
            }, modal);
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {title, prompt} = buildSuccessMessage(uploadedTheme);
        showThemeInstalledModal(title, prompt, uploadedTheme, onActivate);
    };

    const handleUpload = () => {
        if (!uploadConfig) {
            return;
        }

        if (uploadConfig.enabled) {
            NiceModal.show(ConfirmationModal, {
                title: 'Upload theme',
                prompt: <UploadModalContent onUpload={onThemeUpload} />,
                okLabel: '',
                formSheet: false
            });
        } else {
            showUploadLimitModal(uploadConfig.error ?? '', updateRoute);
        }
    };

    const left = (
        <div className='hidden md:!visible md:!block'>
            <TabView
                border={false}
                selectedTab={currentTab}
                tabs={[
                    {id: 'official', title: 'Official themes'},
                    {id: 'installed', title: 'Installed'}
                ]}
                onTabChange={setCurrentTab}
            />
        </div>
    );

    const right = (
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button
                    label='Close'
                    onClick={() => {
                        modal.remove();
                        onClose();
                    }}
                />
                <Button
                    color='black'
                    label='Upload theme'
                    loading={isUploading}
                    onClick={handleUpload}
                />
            </div>
        </div>
    );

    return (
        <>
            <PageHeader containerClassName='bg-white dark:bg-black' left={left} right={right} />
            <div className='px-[8vmin] md:hidden'>
                <TabView
                    border={false}
                    selectedTab={currentTab}
                    tabs={[
                        {id: 'official', title: 'Official themes'},
                        {id: 'installed', title: 'Installed'}
                    ]}
                    onTabChange={setCurrentTab}
                />
            </div>
        </>
    );
};

/**
 * Content component that switches between official and installed themes.
 */
const ThemeModalContent: React.FC<ThemeModalContentProps> = ({
    currentTab,
    onSelectTheme,
    themes
}) => {
    if (currentTab === 'official') {
        return <OfficialThemes onSelectTheme={onSelectTheme} />;
    }
    if (currentTab === 'installed') {
        return <AdvancedThemeSettings themes={themes} />;
    }
    return null;
};

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

/**
 * Main modal component for changing the site theme.
 */
const ChangeThemeModal: React.FC<ChangeThemeModalProps> = ({source, themeRef}) => {
    const [currentTab, setCurrentTab] = useState('official');
    const [selectedTheme, setSelectedTheme] = useState<OfficialTheme | null>(null);
    const [previewMode, setPreviewMode] = useState('desktop');
    const [isInstalling, setInstalling] = useState(false);
    const [installedFromMarketplace, setInstalledFromMarketplace] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const {updateRoute} = useRouting();

    const modal = useModal();
    const {data: {themes} = {}} = useBrowseThemes();
    const {mutateAsync: installTheme} = useInstallTheme();
    const {mutateAsync: activateTheme} = useActivateTheme();
    const {checkThemeLimitError} = useCheckThemeLimitError();
    const handleError = useHandleError();

    const onSelectTheme = (theme: OfficialTheme | null) => {
        setSelectedTheme(theme);
    };

    useEffect(() => {
        setIsMounted(true);
    }, []);

    /** Handles installation when a theme is referenced via URL parameters. */
    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!source || !themeRef || installedFromMarketplace || !isMounted) {
                return;
            }

            const themeName = themeRef.split('/')[1];
            const limitError = await checkThemeLimitError(themeName);
            if (limitError) {
                modal.remove();
                return;
            }

            const existingNames = getExistingThemeNames(themes ?? []);
            const willOverwrite = existingNames.includes(themeName.toLowerCase());
            const index = existingNames.indexOf(themeName.toLowerCase());
            const themeToOverwrite = themes?.[index];

            const prompt = (
                <>
                    By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                    {willOverwrite && (
                        <>
                            <br />
                            <br />
                            This will overwrite your existing version of <strong>{themeName}</strong>
                            {themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
                        </>
                    )}
                </>
            );

            NiceModal.show(ConfirmationModal, {
                title: 'Install Theme',
                prompt,
                okLabel: 'Install',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Installing...',
                okColor: 'black',
                onOk: async (confirmModal) => {
                    setInstalledFromMarketplace(true);
                    if (willOverwrite && themes) {
                        themes.splice(index, 1);
                    }
                    try {
                        const data = await installTheme(themeRef);
                        if (data?.themes[0]) {
                            await activateTheme(data.themes[0].name);
                            showToast({
                                title: 'Theme activated',
                                type: 'success',
                                message: (
                                    <div>
                                        <span className='capitalize'>{data.themes[0].name}</span> is now your active theme
                                    </div>
                                )
                            });
                        }
                        confirmModal?.remove();
                        updateRoute('');
                    } catch (e) {
                        handleError(e);
                    }
                }
            });
        };

        handleUrlInstallation();
    }, [
        source,
        themeRef,
        installedFromMarketplace,
        isMounted,
        themes,
        checkThemeLimitError,
        installTheme,
        activateTheme,
        handleError,
        modal,
        updateRoute
    ]);

    if (!themes) {
        return null;
    }

    /** Initiates installation of the selected theme. */
    const onInstall = async () => {
        if (!selectedTheme) {
            return;
        }

        const limitError = await checkThemeLimitError(selectedTheme.name);
        if (limitError) {
            NiceModal.show(LimitModal, {
                prompt: limitError,
                onOk: () => updateRoute({route: '/pro', isExternal: true})
            });
            return;
        }

        const existingTheme = themes.find(t => t.name.toLowerCase() === selectedTheme.name.toLowerCase());

        if (existingTheme && !isDefaultOrLegacy(selectedTheme.name)) {
            await new Promise<void>((resolve) => {
                NiceModal.show(ConfirmationModal, {
                    title: 'Overwrite theme',
                    prompt: (
                        <>
                            This will overwrite your existing version of {selectedTheme.name}
                            {existingTheme?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
                        </>
                    ),
                    okLabel: 'Overwrite',
                    okRunningLabel: 'Installing...',
                    cancelLabel: 'Cancel',
                    okColor: 'red',
                    onOk: async (confirmModal) => {
                        confirmModal?.remove();
                        await performInstallation();
                        resolve();
                    }
                });
            });
        } else {
            await performInstallation();
        }
    };

    /** Performs the actual installation and optional activation. */
    const performInstallation = async () => {
        let title = 'Success';
        let prompt = <></>;
        let installedTheme: Theme | InstalledTheme | undefined;

        if (isDefaultOrLegacy(selectedTheme!.name)) {
            title = 'Activate theme';
            prompt = (
                <>
                    By clicking below, <strong>{selectedTheme!.name}</strong> will automatically be activated as the theme for your site.
                </>
            );
        } else {
            setInstalling(true);
            try {
                const data = await installTheme(selectedTheme!.ref);
                if (!data) {
                    return;
                }
                const newlyInstalled = data.themes[0];
                installedTheme = newlyInstalled;
                title = 'Success';
                prompt = (
                    <>
                        <strong>{newlyInstalled.name}</strong> has been successfully installed.
                    </>
                );

                if (!newlyInstalled.active) {
                    prompt = (
                        <>
                            {prompt}{' '}
                            Do you want to activate it now?
                        </>
                    );
                }

                const hasErrors = !!newlyInstalled.errors?.length;
                const hasWarnings = !!newlyInstalled.warnings?.length;

                if (hasErrors || hasWarnings) {
                    title = `Installed with ${hasErrors ? 'errors' : 'warnings'}`;
                    prompt = (
                        <>
                            The theme <strong>&quot;{newlyInstalled.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
                        </>
                    );

                    if (!newlyInstalled.active) {
                        prompt = (
                            <>
                                {prompt}
                                You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                            </>
                        );
                    }
                }
            } catch (e) {
                handleError(e);
            } finally {
                setInstalling(false);
            }
        }

        if (!installedTheme) {
            installedTheme = selectedTheme!;
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: installedTheme!,
            onActivate: () => {
                updateRoute('');
            }
        });
    };

    return (
        <Modal
            afterClose={() => {
                updateRoute('');
            }}
            animate={false}
            cancelLabel=''
            footer={false}
            padding={false}
            size='full'
            testId='theme-modal'
            title=''
            scrolling
            onCancel={() => {
                modal.remove();
                updateRoute('');
            }}
        >
            <div className='flex h-full justify-between'>
                <div className='grow'>
                    {selectedTheme && (
                        <ThemePreview
                            installedTheme={themes.find(t => t.name.toLowerCase() === selectedTheme.name.toLowerCase())}
                            isInstalling={isInstalling}
                            selectedTheme={selectedTheme}
                            onBack={() => setSelectedTheme(null)}
                            onClose={() => updateRoute('')}
                            onInstall={onInstall}
                        />
                    )}
                    <ThemeToolbar
                        currentTab={currentTab}
                        modal={modal}
                        previewMode={previewMode}
                        selectedTheme={selectedTheme}
                        setCurrentTab={setCurrentTab}
                        setPreviewMode={setPreviewMode}
                        setSelectedTheme={setSelectedTheme}
                        themes={themes}
                    />
                    {!selectedTheme && (
                        <ThemeModalContent
                            currentTab={currentTab}
                            themes={themes}
                            onSelectTheme={onSelectTheme}
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ChangeThemeModal;