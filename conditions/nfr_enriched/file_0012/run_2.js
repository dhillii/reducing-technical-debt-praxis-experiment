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

const DEFAULT_UPLOAD_ERROR = 'Your current plan doesn\'t support uploading custom themes.';
const DEFAULT_LIMIT_PROMPT = <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>;

// Utility Functions
const getThemeFileName = (file: File): string => file.name.replace(/\.zip$/, '');

const isThemeNameExists = (themeName: string, existingThemes: Theme[]): boolean => {
    return existingThemes.map(t => t.name.toLowerCase()).includes(themeName.toLowerCase());
};

const extractThemeNameFromRef = (themeRef: string): string => themeRef.split('/')[1];

const getThemeByName = (themeName: string, themes: Theme[]): Theme | undefined => {
    return themes.find(theme => theme.name.toLowerCase() === themeName.toLowerCase());
};

// Modal Content Components
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

const TabViewComponent: React.FC<{selectedTab: string; onTabChange: (id: string) => void}> = ({selectedTab, onTabChange}) => (
    <TabView
        border={false}
        selectedTab={selectedTab}
        tabs={TABS}
        onTabChange={onTabChange}
    />
);

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

// Hook for upload configuration
const useUploadConfiguration = (isThemeLimited: boolean, checkThemeLimitError: (name: string) => Promise<string | null>) => {
    const [uploadConfig, setUploadConfig] = useState<UploadConfig | undefined>();

    useEffect(() => {
        const checkUploadLimit = async () => {
            if (isThemeLimited) {
                const error = await checkThemeLimitError('.');
                setUploadConfig({enabled: false, error: error || DEFAULT_UPLOAD_ERROR});
            } else {
                setUploadConfig({enabled: true});
            }
        };

        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    return uploadConfig;
};

// Hook for theme installation state
const useThemeInstallationState = () => {
    const [state, setState] = useState<ThemeInstallationState>({
        isInstalling: false,
        installedFromMarketplace: false,
        isMounted: false
    });

    useEffect(() => {
        setState(prev => ({...prev, isMounted: true}));
    }, []);

    return {
        ...state,
        setInstalling: (isInstalling: boolean) => setState(prev => ({...prev, isInstalling})),
        setInstalledFromMarketplace: (installed: boolean) => setState(prev => ({...prev, installedFromMarketplace: installed}))
    };
};

// Modal Display Functions
const showDefaultOrLegacyThemeError = (themeName: string) => {
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
) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Overwrite theme',
        prompt: <>The theme <strong>{themeName}</strong> already exists. Do you want to overwrite it?</>,
        okLabel: 'Overwrite',
        cancelLabel: 'Cancel',
        okRunningLabel: 'Overwriting...',
        okColor: 'red',
        onOk: onConfirm
    });
};

const showInvalidThemeModal = (
    fatalErrors: FatalErrors,
    onRetry: () => void,
    modal: NiceModalHandler<Record<string, unknown>>
) => {
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

const showUploadModal = (onUpload: (file: File) => void) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Upload theme',
        prompt: <UploadModalContent onUpload={onUpload} />,
        okLabel: '',
        formSheet: false
    });
};

const showLimitModal = (error: string, updateRoute: (route: {route: string; isExternal: boolean}) => void) => {
    NiceModal.show(LimitModal, {
        title: 'Upgrade to enable custom themes',
        prompt: error || DEFAULT_LIMIT_PROMPT,
        onOk: () => updateRoute({route: '/pro', isExternal: true})
    });
};

// Theme Installation Logic
const buildThemeInstalledPrompt = (
    themeName: string,
    isActive: boolean,
    hasErrors: boolean,
    hasWarnings: boolean
): {title: string; prompt: React.ReactNode} => {
    const issueType = hasErrors ? 'errors' : 'warnings';
    const hasIssues = hasErrors || hasWarnings;

    if (hasIssues) {
        return {
            title: `Upload successful with ${issueType}`,
            prompt: (
                <>
                    The theme <strong>&quot;{themeName}&quot;</strong> was installed but we detected some {issueType}.
                    {!isActive && (
                        <>
                            <br/><br/>
                            You are still able to activate and use the theme but it is recommended to fix these {issueType} before you do so.
                        </>
                    )}
                </>
            )
        };
    }

    return {
        title: 'Upload successful',
        prompt: (
            <>
                <strong>{themeName}</strong> uploaded
                {!isActive && ' Do you want to activate it now?'}
            </>
        )
    };
};

const buildMarketplaceInstallPrompt = (
    themeName: string,
    willOverwrite: boolean,
    overwrittenTheme?: Theme
): React.ReactNode => (
    <>
        By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
        {willOverwrite && (
            <>
                <br/><br/>
                This will overwrite your existing version of <strong>{themeName}</strong>
                {overwrittenTheme?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
            </>
        )}
    </>
);

const buildInstallSuccessPrompt = (
    themeName: string,
    isActive: boolean,
    hasErrors: boolean,
    hasWarnings: boolean
): {title: string; prompt: React.ReactNode} => {
    const issueType = hasErrors ? 'errors' : 'warnings';
    const hasIssues = hasErrors || hasWarnings;

    if (hasIssues) {
        return {
            title: `Installed with ${issueType}`,
            prompt: (
                <>
                    The theme <strong>&quot;{themeName}&quot;</strong> was installed successfully but we detected some {issueType}.
                    {!isActive && (
                        <>
                            <br/><br/>
                            You are still able to activate and use the theme but it is recommended to contact the theme developer to fix these {issueType} before you do so.
                        </>
                    )}
                </>
            )
        };
    }

    return {
        title: 'Success',
        prompt: (
            <>
                <strong>{themeName}</strong> has been successfully installed.
                {!isActive && ' Do you want to activate it now?'}
            </>
        )
    };
};

// Main Components
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

    const uploadConfig = useUploadConfiguration(isThemeLimited, checkThemeLimitError);
    const [isUploading, setUploading] = useState(false);

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
            showInvalidThemeModal(fatalErrors, () => handleUpload(), modal);
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {title, prompt} = buildThemeInstalledPrompt(
            uploadedTheme.name,
            uploadedTheme.active,
            !!uploadedTheme.errors?.length,
            !!uploadedTheme.warnings?.length
        );

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = getThemeFileName(file);
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            showDefaultOrLegacyThemeError(themeFileName);
        } else if (isThemeNameExists(themeFileName, themes)) {
            showThemeOverwriteConfirmation(themeFileName, async (confirmModal) => {
                setUploading(true);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);

                await handleThemeUpload({file, onActivate: onClose});
                setUploading(false);
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
            showLimitModal(uploadConfig.error || DEFAULT_LIMIT_PROMPT, updateRoute);
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

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

const ChangeThemeModal: React.FC<ChangeThemeModalProps> = ({source,