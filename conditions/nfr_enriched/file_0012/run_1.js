```typescript
import AdvancedThemeSettings from './theme/advanced-theme-settings';
import InvalidThemeModal, {type FatalErrors} from './theme/invalid-theme-modal';
import NiceModal, {type NiceModalHandler, useModal} from '@ebay/nice-modal-react';
import OfficialThemes from './theme/official-themes';
import React, {useEffect, useState} from 'react';
import ThemeInstalledModal from './theme/theme-installed-modal';
import ThemePreview from './theme/theme-preview';
import {Button, ConfirmationModal, FileUpload, LimitModal, Modal, PageHeader, TabView, showToast} from '@tryghost/admin-x-design-system';
import {type InstalledTheme, type Theme, type ThemesInstallResponseType, isDefaultOrLegacyTheme, useActivateTheme, useBrowseThemes, useInstallTheme, useUploadTheme} from '@tryghost/admin-x-framework/api/themes';
import {JSONError} from '@tryghost/admin-x-framework/errors';
import {type OfficialTheme} from '../../providers/settings-app-provider';
import {useCheckThemeLimitError} from '../../../hooks/use-check-theme-limit-error';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import {useRouting} from '@tryghost/admin-x-framework/routing';

interface ThemeToolbarProps {
    selectedTheme: OfficialTheme|null;
    currentTab: string;
    setCurrentTab: (tab: string) => void;
    setSelectedTheme: (theme: OfficialTheme|null) => void;
    modal: NiceModalHandler<Record<string, unknown>>;
    themes: Theme[];
    setPreviewMode: (mode: string) => void;
    previewMode: string;
}

interface ThemeModalContentProps {
    onSelectTheme: (theme: OfficialTheme|null) => void;
    currentTab: string;
    themes: Theme[];
}

const UploadModalContent: React.FC<{onUpload: (file: File) => void}> = ({onUpload}) => {
    const modal = useModal();

    return <div className="-mb-6">
        <FileUpload
            id="theme-upload"
            onUpload={(file) => {
                modal.remove();
                onUpload(file);
            }}
        >
            <div className="cursor-pointer bg-grey-75 p-10 text-center dark:bg-grey-950">
            Click to select or drag & drop zip file
            </div>
        </FileUpload>
    </div>;
};

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
                setUploadConfig({enabled: false, error: error || 'Your current plan doesn\'t support uploading custom themes.'});
            } else {
                setUploadConfig({enabled: true});
            }
        };

        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    const onClose = () => {
        updateRoute('/');
    };

    // Handles confirmation for default/legacy theme upload attempt
    const showDefaultThemeError = (themeFileName: string) => {
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
            onOk: async (confirmModal) => {
                confirmModal?.remove();
            }
        });
    };

    // Handles confirmation for overwriting existing theme
    const showOverwriteConfirmation = (themeFileName: string, onConfirm: () => Promise<void>) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Overwrite theme',
            prompt: (
                <>
                    The theme <strong>{themeFileName}</strong> already exists.
                    Do you want to overwrite it?
                </>
            ),
            okLabel: 'Overwrite',
            cancelLabel: 'Cancel',
            okRunningLabel: 'Overwriting...',
            okColor: 'red',
            onOk: async (confirmModal) => {
                setUploading(true);
                const existingThemeNames = themes.map(t => t.name);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);

                await onConfirm();
                setUploading(false);
                setCurrentTab('installed');
                confirmModal?.remove();
            }
        });
    };

    // Processes theme upload and shows appropriate modal
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
            setUploading(false);
        } catch (e) {
            setUploading(false);

            if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
                fatalErrors = e.data.errors as FatalErrors;
            } else {
                handleError(e);
            }
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
        const modalConfig = buildThemeInstalledModalConfig(uploadedTheme, onActivate);

        NiceModal.show(ThemeInstalledModal, modalConfig);
    };

    // Builds configuration for theme installed modal based on upload result
    const buildThemeInstalledModalConfig = (uploadedTheme: Theme, onActivate?: () => void) => {
        let title = 'Upload successful';
        let prompt = <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>;

        if (!uploadedTheme.active) {
            prompt = <>
                {prompt}{' '}
                Do you want to activate it now?
            </>;
        }

        if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
            const hasErrors = uploadedTheme?.errors?.length;

            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
            </>;

            if (!uploadedTheme.active) {
                prompt = <>
                    {prompt}
                    You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                </>;
            }
        }

        return {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        };
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            showDefaultThemeError(themeFileName);
        } else if (existingThemeNames.includes(themeFileName)) {
            showOverwriteConfirmation(themeFileName, () => handleThemeUpload({file, onActivate: onClose}));
        } else {
            setCurrentTab('installed');
            handleThemeUpload({file, onActivate: onClose});
        }
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
                prompt: uploadConfig.error || <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>,
                onOk: () => updateRoute({route: '/pro', isExternal: true})
            });
        }
    };

    const left =
    <div className='hidden md:!visible md:!block'>
        <TabView
            border={false}
            selectedTab={currentTab}
            tabs={[
                {id: 'official', title: 'Official themes'},
                {id: 'installed', title: 'Installed'}
            ]}
            onTabChange={(id: string) => {
                setCurrentTab(id);
            }} />
    </div>;

    const right =
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={() => {
                    modal.remove();
                    onClose();
                }} />
                <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
            </div>
        </div>;

    return (<>
        <PageHeader containerClassName='bg-white dark:bg-black' left={left} right={right} />
        <div className='px-[8vmin] md:hidden'>
            <TabView
                border={false}
                selectedTab={currentTab}
                tabs={[
                    {id: 'official', title: 'Official themes'},
                    {id: 'installed', title: 'Installed'}
                ]}
                onTabChange={(id: string) => {
                    setCurrentTab(id);
                }} />
        </div>
    </>);
};

const ThemeModalContent: React.FC<ThemeModalContentProps> = ({
    currentTab,
    onSelectTheme,
    themes
}) => {
    switch (currentTab) {
    case 'official':
        return (
            <OfficialThemes onSelectTheme={onSelectTheme} />
        );
    case 'installed':
        return (
            <AdvancedThemeSettings themes={themes} />
        );
    }
    return null;
};

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

// Builds configuration for marketplace theme installation confirmation
const buildMarketplaceInstallConfig = (themeName: string, willOverwrite: boolean, themeToOverwrite: Theme | undefined) => {
    let prompt = <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
        {willOverwrite &&
        <>
            <br/>
            <br/>
            This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
        </>
        }
    </>;

    return {
        title: 'Install Theme',
        prompt,
        okLabel: 'Install',
        cancelLabel: 'Cancel',
        okRunningLabel: 'Installing...',
        okColor: 'black'
    };
};

// Handles installation of theme from marketplace URL
const useMarketplaceThemeInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    themes: Theme[] | undefined,
    isMounted: boolean,
    installedFromMarketplace: boolean,
    setInstalledFromMarketplace: (value: boolean) => void,
    modal: NiceModalHandler<Record<string, unknown>>,
    checkThemeLimitError: (name: string) => Promise<string | null>,
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>,
    activateTheme: (name: string) => Promise<void>,
    updateRoute: (route: string) => void,
    handleError: (error: unknown) => void
) => {
    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (source && themeRef && !installedFromMarketplace && isMounted) {
                const themeName = themeRef.split('/')[1];

                const limitError = await checkThemeLimitError(themeName);
                if (limitError) {
                    modal.remove();
                    return;
                }

                const existingThemeNames = themes?.map(t => t.name) || [];
                const willOverwrite = existingThemeNames.includes(themeName.toLowerCase());
                const index = existingThemeNames.indexOf(themeName.toLowerCase());
                const themeToOverwrite = themes?.[index];

                const config = buildMarketplaceInstallConfig(themeName, willOverwrite, themeToOverwrite);

                NiceModal.show(ConfirmationModal, {
                    ...config,
                    onOk: async (confirmModal) => {
                        let data: ThemesInstallResponseType | undefined;
                        setInstalledFromMarketplace(true);
                        try {
                            if (willOverwrite && themes) {
                                themes.splice(index, 1);
                            }
                            data = await installTheme(themeRef);
                            if (data?.themes[0]) {
                                await activateTheme(data.themes[0].name);
                                showToast({
                                    title: 'Theme activated',
                                    type: 'success',
                                    message: <div><span className='capitalize'>{data.themes[0].name}</span> is now your active theme</div>
                                });
                            }
                            confirmModal?.remove();
                            updateRoute('');
                        } catch (e) {
                            handleError(e);
                        }
                    }
                });
            }
        };

        handleUrlInstallation();
    }, [themeRef, source, installTheme, handleError, activateTheme, updateRoute, themes, installedFromMarketplace, checkThemeLimitError, modal, isMounted, setInstalledFromMarketplace]);
};

// Builds configuration for theme installation result modal
const buildInstallationResultConfig = (selectedTheme: OfficialTheme, newlyInstalledTheme: Theme) => {
    let title = 'Success';
    let prompt = <>
        <strong>{newlyInstalledTheme.name}</strong> has been successfully installed.
    </>;

    if (!newlyInstalledTheme.active) {
        prompt = <>
            {prompt}{' '}
            Do you want to activate it now?
        </>;
    }

    if (newlyInstalledTheme.errors?.length || newlyInstalledTheme.warnings?.length) {
        const hasErrors = newlyInstalledTheme.errors?.length;

        title = `