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
 * Guard predicate to check if a theme name corresponds to a default or legacy theme.
 */
function isDefaultThemeName(name: string): boolean {
    return isDefaultOrLegacyTheme({name});
}

/**
 * Guard predicate to determine if a theme already exists in the list.
 */
function themeExists(themeName: string, existingNames: string[]): boolean {
    return existingNames.includes(themeName);
}

/**
 * Guard predicate to check if a JSONError has status 422 and contains errors.
 */
function isValidationError(error: unknown): error is JSONError {
    return error instanceof JSONError && error.response?.status === 422 && !!error.data?.errors;
}

/**
 * Builds the title and prompt for a successful upload.
 */
function buildSuccessPrompt(uploadedTheme: Theme) {
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
 * Shows the modal for an invalid theme upload.
 */
async function showInvalidThemeModal(fatalErrors: FatalErrors, modal: NiceModalHandler<Record<string, unknown>>, handleUpload: () => void) {
    NiceModal.show(InvalidThemeModal, {
        title: 'Invalid Theme',
        prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re‑upload the theme</>,
        fatalErrors,
        onRetry: async () => {
            modal?.remove();
            handleUpload();
        }
    });
}

/**
 * Shows a confirmation modal when the uploaded theme already exists.
 */
async function confirmOverwrite(
    themeFileName: string,
    existingThemeNames: string[],
    themes: Theme[],
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
    setCurrentTab: (tab: string) => void,
    handleThemeUpload: (params: {file: File; onActivate?: () => void}) => Promise<void>,
    onClose: () => void,
    file: File
) {
    setUploading(true);
    const index = existingThemeNames.indexOf(themeFileName);
    themes.splice(index, 1);
    await handleThemeUpload({file, onActivate: onClose});
    setUploading(false);
    setCurrentTab('installed');
}

/**
 * Shows a modal informing the user that a default theme cannot be overwritten.
 */
function showDefaultThemeError(themeFileName: string) {
    NiceModal.show(ConfirmationModal, {
        title: 'Upload failed',
        cancelLabel: 'Cancel',
        okLabel: '',
        prompt: (
            <>
                <p>The default <strong>{themeFileName}</strong> theme cannot be overwritten.</p>
                <p>Rename your zip file and try again.</p>
            </>
        ),
        onOk: (confirmModal) => {
            confirmModal?.remove();
        }
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
                setUploadConfig({enabled: false, error: error || "Your current plan doesn’t support uploading custom themes."});
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
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultThemeName(themeFileName)) {
            showDefaultThemeError(themeFileName);
            return;
        }

        if (themeExists(themeFileName, existingThemeNames)) {
            await confirmOverwrite(
                themeFileName,
                existingThemeNames,
                themes,
                setUploading,
                setCurrentTab,
                handleThemeUpload,
                onClose,
                file
            );
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
        let data: ThemesInstallResponseType | undefined;
        let fatalErrors: FatalErrors | null = null;

        try {
            setUploading(true);
            data = await uploadTheme({file});
        } catch (e) {
            if (isValidationError(e)) {
                fatalErrors = e.data.errors as FatalErrors;
            } else {
                handleError(e);
            }
        } finally {
            setUploading(false);
        }

        if (fatalErrors && !data) {
            await showInvalidThemeModal(fatalErrors, modal, () => handleUpload());
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {title, prompt} = buildSuccessPrompt(uploadedTheme);

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
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
            NiceModal.show(LimitModal, {
                title: 'Upgrade to enable custom themes',
                prompt: uploadConfig.error || (
                    <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>
                ),
                onOk: () => updateRoute({route: '/pro', isExternal: true})
            });
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
 * Content component that switches between official and installed theme views.
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
 * Main modal component for changing themes.
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

    /**
     * Determines whether URL‑based installation should run.
     */
    function shouldInstallFromUrl(): boolean {
        return !!source && !!themeRef && !installedFromMarketplace && isMounted;
    }

    /**
     * Handles installation when the modal is opened via URL parameters.
     */
    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!shouldInstallFromUrl()) {
                return;
            }

            const themeName = themeRef!.split('/')[1];
            const limitError = await checkThemeLimitError(themeName);
            if (limitError) {
                modal.remove();
                return;
            }

            const existingThemeNames = themes?.map(t => t.name) || [];
            const willOverwrite = existingThemeNames.includes(themeName.toLowerCase());
            const index = existingThemeNames.indexOf(themeName.toLowerCase());
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
                    try {
                        if (willOverwrite && themes) {
                            themes.splice(index, 1);
                        }
                        const data = await installTheme(themeRef!);
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
        themeRef,
        source,
        installTheme,
        handleError,
        activateTheme,
        updateRoute,
        themes,
        installedFromMarketplace,
        checkThemeLimitError,
        modal,
        isMounted
    ]);

    if (!themes) {
        return null;
    }

    /**
     * Performs the actual installation of a selected theme.
     */
    const performInstallation = async (theme: OfficialTheme) => {
        let title = 'Success';
        let prompt = <></>;

        if (isDefaultThemeName(theme.name)) {
            title = 'Activate theme';
            prompt = (
                <>By clicking below, <strong>{theme.name}</strong> will automatically be activated as the theme for your site.</>
            );
        } else {
            setInstalling(true);
            let data: ThemesInstallResponseType | undefined;
            try {
                data = await installTheme(theme.ref);
            } catch (e) {
                handleError(e);
            } finally {
                setInstalling(false);
            }

            if (!data) {
                return;
            }

            const newlyInstalled = data.themes[0];
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

            NiceModal.show(ThemeInstalledModal, {
                title,
                prompt,
                installedTheme: newlyInstalled,
                onActivate: () => {
                    updateRoute('');
                }
            });
        }
    };

    /**
     * Handles the install button click for a selected theme.
     */
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

        const installedTheme = themes.find(t => t.name.toLowerCase() === selectedTheme.name.toLowerCase());

        if (installedTheme && !isDefaultThemeName(selectedTheme.name)) {
            await new Promise<void>((resolve) => {
                NiceModal.show(ConfirmationModal, {
                    title: 'Overwrite theme',
                    prompt: (
                        <>
                            This will overwrite your existing version of {selectedTheme.name}
                            {installedTheme?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
                        </>
                    ),
                    okLabel: 'Overwrite',
                    okRunningLabel: 'Installing...',
                    cancelLabel: 'Cancel',
                    okColor: 'red',
                    onOk: async (confirmModal) => {
                        confirmModal?.remove();
                        await performInstallation(selectedTheme);
                        resolve();
                    }
                });
            });
        } else {
            await performInstallation(selectedTheme);
        }
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
                            onBack={() => {
                                setSelectedTheme(null);
                            }}
                            onClose={() => {
                                updateRoute('');
                            }}
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