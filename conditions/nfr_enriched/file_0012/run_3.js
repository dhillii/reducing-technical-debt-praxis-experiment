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

    // Validates if theme can be uploaded based on name and existing themes
    const validateThemeUpload = (themeFileName: string): {valid: boolean; requiresConfirmation: boolean; confirmationType?: 'default' | 'overwrite'} => {
        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            return {valid: false, requiresConfirmation: true, confirmationType: 'default'};
        }
        const existingThemeNames = themes.map(t => t.name);
        if (existingThemeNames.includes(themeFileName)) {
            return {valid: true, requiresConfirmation: true, confirmationType: 'overwrite'};
        }
        return {valid: true, requiresConfirmation: false};
    };

    // Shows confirmation modal for default/legacy theme
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

    // Shows confirmation modal for theme overwrite
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
                await onConfirm();
                confirmModal?.remove();
            }
        });
    };

    // Handles theme upload process with error handling
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

        showThemeInstalledModal(data.themes[0], onActivate);
    };

    // Builds and shows theme installed modal with appropriate messaging
    const showThemeInstalledModal = (uploadedTheme: Theme, onActivate?: () => void) => {
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

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const validation = validateThemeUpload(themeFileName);

        if (!validation.valid) {
            showDefaultThemeError(themeFileName);
            return;
        }

        if (validation.requiresConfirmation && validation.confirmationType === 'overwrite') {
            showOverwriteConfirmation(themeFileName, async () => {
                setUploading(true);
                const existingThemeNames = themes.map(t => t.name);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);
                await handleThemeUpload({file, onActivate: onClose});
                setUploading(false);
                setCurrentTab('installed');
            });
        } else {
            setCurrentTab('installed');
            handleThemeUpload({file, onActivate: onClose});
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

// Handles marketplace theme installation from URL parameters
const useMarketplaceThemeInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    themes: Theme[] | undefined,
    isMounted: boolean,
    installedFromMarketplace: boolean,
    setInstalledFromMarketplace: (value: boolean) => void,
    modal: NiceModalHandler<Record<string, unknown>>
) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: installTheme} = useInstallTheme();
    const {mutateAsync: activateTheme} = useActivateTheme();
    const {checkThemeLimitError} = useCheckThemeLimitError();
    const handleError = useHandleError();

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

                const prompt = buildMarketplaceInstallPrompt(themeName, willOverwrite, themeToOverwrite);

                NiceModal.show(ConfirmationModal, {
                    title: 'Install Theme',
                    prompt,
                    okLabel: 'Install',
                    cancelLabel: 'Cancel',
                    okRunningLabel: 'Installing...',
                    okColor: 'black',
                    onOk: async (confirmModal) => {
                        await performMarketplaceInstallation(
                            themeRef,
                            themeName,
                            willOverwrite,
                            index,
                            themes,
                            installTheme,
                            activateTheme,
                            updateRoute,
                            handleError,
                            setInstalledFromMarketplace,
                            confirmModal
                        );
                    }
                });
            }
        };

        handleUrlInstallation();
    }, [themeRef, source, installTheme, handleError, activateTheme, updateRoute, themes, installedFromMarketplace, checkThemeLimitError, modal, isMounted, setInstalledFromMarketplace]);
};

// Builds prompt message for marketplace theme installation
const buildMarketplaceInstallPrompt = (themeName: string, willOverwrite: boolean, themeToOverwrite: Theme | undefined) => {
    return <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
        {willOverwrite &&
        <>
            <br/>
            <br/>
            This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
        </>
        }
    </>;
};

// Performs marketplace theme installation
const performMarketplaceInstallation = async (
    themeRef: string,
    themeName: string,
    willOverwrite: boolean,
    index: number,
    themes: Theme[] | undefined,
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>,
    activateTheme: (name: string) => Promise<void>,
    updateRoute: (route: string) => void,
    handleError: (error: unknown) => void,
    setInstalledFromMarketplace: (value: boolean) => void,