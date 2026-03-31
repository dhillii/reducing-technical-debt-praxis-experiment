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

const UPLOAD_LIMIT_MESSAGE = 'Your current plan doesn\'t support uploading custom themes.';
const PLAN_LIMIT_MESSAGE = <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>;

// Utility functions
const getThemeFileName = (file: File): string => file.name.replace(/\.zip$/, '');

const isThemeNameExists = (themeName: string, themes: Theme[]): boolean => 
    themes.map(t => t.name).includes(themeName);

const findThemeIndex = (themeName: string, themes: Theme[]): number =>
    themes.map(t => t.name).indexOf(themeName);

const removeThemeFromArray = (themeName: string, themes: Theme[]): void => {
    const index = findThemeIndex(themeName, themes);
    if (index > -1) {
        themes.splice(index, 1);
    }
};

// Modal content components
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

// Theme validation and confirmation modals
const showDefaultThemeError = (themeName: string): void => {
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
        onOk: async (confirmModal) => {
            confirmModal?.remove();
        }
    });
};

const showThemeOverwriteConfirmation = (
    themeName: string,
    onConfirm: (confirmModal: NiceModalHandler<Record<string, unknown>>) => Promise<void>
): void => {
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
        prompt: error || PLAN_LIMIT_MESSAGE,
        onOk: onUpgrade
    });
};

const showInvalidThemeModal = (
    fatalErrors: FatalErrors,
    onRetry: () => void
): void => {
    NiceModal.show(InvalidThemeModal, {
        title: 'Invalid Theme',
        prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
        fatalErrors,
        onRetry
    });
};

// Theme installation result handling
const buildThemeInstalledPrompt = (
    theme: Theme | InstalledTheme,
    isActive: boolean
): React.ReactNode => {
    const hasErrors = theme.errors?.length;
    const hasIssues = hasErrors || theme.warnings?.length;

    if (!hasIssues) {
        return isActive ? null : <>Do you want to activate it now?</>;
    }

    return (
        <>
            You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
        </>
    );
};

const getThemeInstalledModalConfig = (theme: Theme | InstalledTheme) => {
    const hasErrors = theme.errors?.length;
    const hasIssues = hasErrors || theme.warnings?.length;

    if (!hasIssues) {
        return {
            title: 'Upload successful',
            prompt: <><strong>{theme.name}</strong> uploaded</>
        };
    }

    return {
        title: `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`,
        prompt: <>The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.</>
    };
};

// Theme toolbar component
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
                setUploadConfig({enabled: false, error: error || UPLOAD_LIMIT_MESSAGE});
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
            showInvalidThemeModal(fatalErrors, () => {
                modal?.remove();
                handleUpload();
            });
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {title, prompt: basePrompt} = getThemeInstalledModalConfig(uploadedTheme);

        let prompt = <><strong>{uploadedTheme.name}</strong> uploaded</>;
        if (!uploadedTheme.active) {
            prompt = <>{prompt} Do you want to activate it now?</>;
        }

        if (uploadedTheme.errors?.length || uploadedTheme.warnings?.length) {
            const additionalPrompt = buildThemeInstalledPrompt(uploadedTheme, uploadedTheme.active);
            prompt = <>
                {basePrompt}
                {additionalPrompt && <>{additionalPrompt}</>}
            </>;
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = getThemeFileName(file);

        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            showDefaultThemeError(themeFileName);
        } else if (isThemeNameExists(themeFileName, themes)) {
            showThemeOverwriteConfirmation(themeFileName, async (confirmModal) => {
                removeThemeFromArray(themeFileName, themes);
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

    const left = (
        <div className='hidden md:!visible md:!block'>
            <TabViewComponent selectedTab={currentTab} onTabChange={setCurrentTab} />
        </div>
    );

    const right = (
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={() => {
                    modal.remove();
                    onClose();
                }} />
                <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
            </div>
        </div>
    );

    return (
        <>
            <PageHeader containerClassName='bg-white dark:bg-black' left={left} right={right} />
            <div className='px-[8vmin] md:hidden'>
                <TabViewComponent selectedTab={currentTab} onTabChange={setCurrentTab} />
            </div>
        </>
    );
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

// Marketplace installation handler
const useMarketplaceInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    themes: Theme[] | undefined,
    state: ThemeInstallationState,
    setState: (updates: Partial<ThemeInstallationState>) => void
) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: installTheme} = useInstallTheme();
    const {mutateAsync: activateTheme} = useActivateTheme();
    const {checkThemeLimitError} = useCheckThemeLimitError();
    const handleError = useHandleError();
    const modal = useModal();

    return useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!source || !themeRef || state.installedFromMarketplace || !state.isMounted) {
                return;
            }

            const themeName = themeRef.split('/')[1];
            const limitError = await checkThemeLimitError(themeName);

            if (limitError) {
                modal.remove();
                return;
            }

            const existingThemeNames = themes?.map(t => t.name.toLowerCase()) || [];
            const willOverwrite = existingThemeNames.includes(themeName.toLowerCase());
            const themeIndex = existingThemeNames.indexOf(themeName.toLowerCase());
            const themeToOverwrite = themes?.[themeIndex];

            const prompt = (
                <>
                    By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                    {willOverwrite && (
                        <>
                            <br/><br/>
                            This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
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
                    try {
                        if (willOverwrite && themes) {
                            removeThemeFromArray(themeName, themes);
                        }
                        const data = await installTheme(themeRef);
                        if (data?.themes[0]) {
                            await activateTheme(data.themes[0].name);
                            showToast({
                                title: 'Theme activated',
                                type: 'success',
                                message: <div><span className='capitalize'>{