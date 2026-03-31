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

interface UploadConfig {
    enabled: boolean;
    error?: string;
}

interface ThemeInstallationState {
    isInstalling: boolean;
    installedFromMarketplace: boolean;
    isMounted: boolean;
}

// Constants
const TABS = [
    {id: 'official', title: 'Official themes'},
    {id: 'installed', title: 'Installed'}
] as const;

const UPLOAD_ERROR_MESSAGE = 'Your current plan doesn\'t support uploading custom themes.';
const LIMIT_MODAL_PROMPT = <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>;

// Utility functions
const getThemeFileName = (file: File): string => file.name.replace(/\.zip$/, '');

const findExistingTheme = (themes: Theme[], themeName: string): Theme | undefined => 
    themes.find(theme => theme.name.toLowerCase() === themeName.toLowerCase());

const getThemeIndexByName = (themes: Theme[], themeName: string): number =>
    themes.findIndex(theme => theme.name.toLowerCase() === themeName.toLowerCase());

const showDefaultThemeError = (themeFileName: string): void => {
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

const showOverwriteConfirmation = (
    themeFileName: string,
    onConfirm: (confirmModal: NiceModalHandler<Record<string, unknown>>) => Promise<void>
): void => {
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
        onOk: onConfirm
    });
};

const showUploadModal = (onUpload: (file: File) => void): void => {
    NiceModal.show(ConfirmationModal, {
        title: 'Upload theme',
        prompt: <UploadModalContent onUpload={onUpload} />,
        okLabel: '',
        formSheet: false
    });
};

const showLimitModal = (error: string, onUpgrade: () => void): void => {
    NiceModal.show(LimitModal, {
        title: 'Upgrade to enable custom themes',
        prompt: error || LIMIT_MODAL_PROMPT,
        onOk: onUpgrade
    });
};

// Components
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

const TabViewComponent: React.FC<{selectedTab: string; onTabChange: (id: string) => void}> = ({
    selectedTab,
    onTabChange
}) => (
    <TabView
        border={false}
        selectedTab={selectedTab}
        tabs={TABS}
        onTabChange={onTabChange}
    />
);

const ThemeToolbar: React.FC<ThemeToolbarProps> = ({
    currentTab,
    setCurrentTab,
    themes,
    modal
}) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: uploadTheme} = useUploadTheme();
    const {checkThemeLimitError, isThemeLimited} = useCheckThemeLimitError();
    const handleError = useHandleError();

    const [uploadConfig, setUploadConfig] = useState<UploadConfig | undefined>();
    const [isUploading, setUploading] = useState(false);

    useEffect(() => {
        const checkUploadLimit = async () => {
            if (isThemeLimited) {
                const error = await checkThemeLimitError('.');
                setUploadConfig({enabled: false, error: error || UPLOAD_ERROR_MESSAGE});
            } else {
                setUploadConfig({enabled: true});
            }
        };

        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    const onClose = () => {
        updateRoute('/');
    };

    const handleThemeUpload = async ({
        file,
        onActivate
    }: {
        file: File;
        onActivate?: () => void
    }): Promise<void> => {
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
            NiceModal.show(InvalidThemeModal, {
                title: 'Invalid Theme',
                prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
                fatalErrors,
                onRetry: () => {
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
        const hasErrors = uploadedTheme?.errors?.length;
        const hasIssues = hasErrors || uploadedTheme.warnings?.length;

        let title = hasIssues 
            ? `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`
            : 'Upload successful';

        let prompt = <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>;

        if (hasIssues) {
            prompt = <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
            </>;
        }

        if (!uploadedTheme.active) {
            prompt = <>
                {prompt}{' '}
                {hasIssues 
                    ? `You are still able to activate and use the theme but it is recommended to fix these ${hasErrors ? 'errors' : 'warnings'} before you do so.`
                    : 'Do you want to activate it now?'
                }
            </>;
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = getThemeFileName(file);
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            showDefaultThemeError(themeFileName);
        } else if (existingThemeNames.includes(themeFileName)) {
            showOverwriteConfirmation(themeFileName, async (confirmModal) => {
                setUploading(true);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);

                await handleThemeUpload({file, onActivate: onClose});
                setCurrentTab('installed');
                confirmModal?.remove();
            });
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
            showUploadModal(onThemeUpload);
        } else {
            showLimitModal(uploadConfig.error || '', () => updateRoute({route: '/pro', isExternal: true}));
        }
    };

    return (<>
        <PageHeader 
            containerClassName='bg-white dark:bg-black' 
            left={
                <div className='hidden md:!visible md:!block'>
                    <TabViewComponent selectedTab={currentTab} onTabChange={setCurrentTab} />
                </div>
            }
            right={
                <div className='flex items-center gap-14'>
                    <div className='flex items-center gap-3'>
                        <Button label='Close' onClick={() => {
                            modal.remove();
                            onClose();
                        }} />
                        <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
                    </div>
                </div>
            }
        />
        <div className='px-[8vmin] md:hidden'>
            <TabViewComponent selectedTab={currentTab} onTabChange={setCurrentTab} />
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
        return <OfficialThemes onSelectTheme={onSelectTheme} />;
    case 'installed':
        return <AdvancedThemeSettings themes={themes} />;
    default:
        return null;
    }
};

// Theme installation logic
const createInstallationHandler = (
    selectedTheme: OfficialTheme,
    installedTheme: Theme | InstalledTheme | undefined,
    themes: Theme[],
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>,
    activateTheme: (name: string) => Promise<void>,
    checkThemeLimitError: (name: string) => Promise<string | null>,
    handleError: (error: unknown) => void,
    updateRoute: (route: string) => void,
    setInstalling: (value: boolean) => void
) => {
    return async () => {
        const limitError = await checkThemeLimitError(selectedTheme.name);
        if (limitError) {
            NiceModal.show(LimitModal, {
                prompt: limitError,
                onOk: () => updateRoute({route: '/pro', isExternal: true})
            });
            return;
        }

        if (installedTheme && !isDefaultOrLegacyTheme(selectedTheme)) {
            return new Promise<void>((resolve) => {
                NiceModal.show(ConfirmationModal, {
                    title: 'Overwrite theme',
                    prompt: (
                        <>
                            This will overwrite your existing version of {selectedTheme.name}{installedTheme?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
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
        }

        return performInstallation();
    };

    async function performInstallation() {
        if (isDefaultOrLegacyTheme(selectedTheme)) {
            NiceModal.show(ThemeInstalledModal, {
                title: 'Activate theme',
                prompt: <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>,
                installedTheme: installedTheme!,
                onActivate: () => updateRoute('')
            });
            return;
        }

        setInstalling(true);
        let data: ThemesInstallResponseType | undefined;
        try {
            data = await installTheme(selectedTheme.ref);
        } catch (e) {
            handleError(e);
        } finally {
            setInstalling(false);
        }

        if (!data) {
            return;
        }

        const newlyInstalledTheme = data.themes[0];
        const hasErrors = newlyInstalledTheme.errors?.length;
        const hasIssues = hasErrors || newlyInstalledTheme.warnings?.length;

        let title = hasIssues 
            ? `Installed with ${hasErrors ? 'errors' : 'warnings'}`
            : 'Success';

        let prompt = <>
            <strong>{newlyInstalledTheme.name}</strong> has been successfully installed.
        </>;

        if (hasIssues) {
            prompt = <>
                The theme <strong>&quot;{newlyInstalledTheme.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
            </>;
        }

        if (!newlyInstalledTheme.active) {
            prompt = <>
                {prompt}{' '}
                {hasIssues 
                    ? `You are still able to activate and use the theme but it is recommended to contact the theme developer fix these ${hasErrors ? 'errors' : 'warnings'} before you do so.`
                    : 'Do you want to activate it now?'
                }
            </>;
        }