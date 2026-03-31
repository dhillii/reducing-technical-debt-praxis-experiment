```tsx
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThemeToolbarProps {
    selectedTheme: OfficialTheme | null;
    currentTab: string;
    setCurrentTab: (tab: string) => void;
    setSelectedTheme: (theme: OfficialTheme | null) => void;
    modal: NiceModalHandler<Record<string, unknown>>;
    themes: Theme[];
    setPreviewMode: (mode: string) => void;
    previewMode: string;
}

interface ThemeModalContentProps {
    onSelectTheme: (theme: OfficialTheme | null) => void;
    currentTab: string;
    themes: Theme[];
}

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

type UploadConfig = {enabled: boolean; error?: string};

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_TABS = [
    {id: 'official', title: 'Official themes'},
    {id: 'installed', title: 'Installed'}
];

const DEFAULT_LIMIT_ERROR = "Your current plan doesn't support uploading custom themes.";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getThemeIssueLabel = (theme: InstalledTheme) => (theme.errors?.length ? 'errors' : 'warnings');

const buildInstallPrompt = (theme: InstalledTheme): React.ReactNode => {
    const issueLabel = getThemeIssueLabel(theme);
    const hasIssues = theme.errors?.length || theme.warnings?.length;

    let prompt: React.ReactNode = (
        <>
            <strong>{theme.name}</strong> has been successfully installed.
        </>
    );

    if (!theme.active) {
        prompt = <>{prompt}{' '}Do you want to activate it now?</>;
    }

    if (hasIssues) {
        prompt = (
            <>
                The theme <strong>&quot;{theme.name}&quot;</strong> was installed successfully but we detected some {issueLabel}.
                {!theme.active && (
                    <> You are still able to activate and use the theme but it is recommended to contact the theme developer to fix these {issueLabel} before you do so.</>
                )}
            </>
        );
    }

    return prompt;
};

const buildUploadPrompt = (theme: InstalledTheme): React.ReactNode => {
    const issueLabel = getThemeIssueLabel(theme);
    const hasIssues = theme.errors?.length || theme.warnings?.length;

    let prompt: React.ReactNode = <><strong>{theme.name}</strong> uploaded</>;

    if (!theme.active) {
        prompt = <>{prompt}{' '}Do you want to activate it now?</>;
    }

    if (hasIssues) {
        prompt = (
            <>
                The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {issueLabel}.
                {!theme.active && (
                    <> You are still able to activate and use the theme but it is recommended to fix these {issueLabel} before you do so.</>
                )}
            </>
        );
    }

    return prompt;
};

const buildInstallTitle = (theme: InstalledTheme): string => {
    const hasIssues = theme.errors?.length || theme.warnings?.length;
    if (!hasIssues) {
        return 'Success';
    }
    return `Installed with ${getThemeIssueLabel(theme)}`;
};

const buildUploadTitle = (theme: InstalledTheme): string => {
    const hasIssues = theme.errors?.length || theme.warnings?.length;
    if (!hasIssues) {
        return 'Upload successful';
    }
    return `Upload successful with ${getThemeIssueLabel(theme)}`;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

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

const ThemeTabView: React.FC<{currentTab: string; onTabChange: (id: string) => void}> = ({currentTab, onTabChange}) => (
    <TabView
        border={false}
        selectedTab={currentTab}
        tabs={THEME_TABS}
        onTabChange={onTabChange}
    />
);

const ThemeModalContent: React.FC<ThemeModalContentProps> = ({currentTab, onSelectTheme, themes}) => {
    if (currentTab === 'official') {
        return <OfficialThemes onSelectTheme={onSelectTheme} />;
    }
    if (currentTab === 'installed') {
        return <AdvancedThemeSettings themes={themes} />;
    }
    return null;
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useUploadConfig = () => {
    const {checkThemeLimitError, isThemeLimited} = useCheckThemeLimitError();
    const [uploadConfig, setUploadConfig] = useState<UploadConfig | undefined>();

    useEffect(() => {
        const checkUploadLimit = async () => {
            if (isThemeLimited) {
                const error = await checkThemeLimitError('.');
                setUploadConfig({enabled: false, error: error || DEFAULT_LIMIT_ERROR});
            } else {
                setUploadConfig({enabled: true});
            }
        };
        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    return uploadConfig;
};

const useThemeUpload = (themes: Theme[], setCurrentTab: (tab: string) => void, onClose: () => void) => {
    const modal = useModal();
    const {mutateAsync: uploadTheme} = useUploadTheme();
    const handleError = useHandleError();
    const [isUploading, setUploading] = useState(false);

    const handleThemeUpload = async (file: File, onActivate?: () => void) => {
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
                onRetry: async () => {
                    modal?.remove();
                    triggerUploadModal();
                }
            });
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];

        NiceModal.show(ThemeInstalledModal, {
            title: buildUploadTitle(uploadedTheme),
            prompt: buildUploadPrompt(uploadedTheme),
            installedTheme: uploadedTheme,
            onActivate
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyTheme({name: themeFileName})) {
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
                onOk: async (confirmModal) => confirmModal?.remove()
            });
            return;
        }

        if (existingThemeNames.includes(themeFileName)) {
            NiceModal.show(ConfirmationModal, {
                title: 'Overwrite theme',
                prompt: <>The theme <strong>{themeFileName}</strong> already exists. Do you want to overwrite it?</>,
                okLabel: 'Overwrite',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Overwriting...',
                okColor: 'red',
                onOk: async (confirmModal) => {
                    const index = existingThemeNames.indexOf(themeFileName);
                    themes.splice(index, 1);
                    await handleThemeUpload(file, onClose);
                    setCurrentTab('installed');
                    confirmModal?.remove();
                }
            });
            return;
        }

        setCurrentTab('installed');
        handleThemeUpload(file, onClose);
    };

    const triggerUploadModal = () => {
        NiceModal.show(ConfirmationModal, {
            title: 'Upload theme',
            prompt: <UploadModalContent onUpload={onThemeUpload} />,
            okLabel: '',
            formSheet: false
        });
    };

    return {isUploading, triggerUploadModal};
};

// ─── ThemeToolbar ─────────────────────────────────────────────────────────────

const ThemeToolbar: React.FC<ThemeToolbarProps> = ({currentTab, setCurrentTab, themes}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const uploadConfig = useUploadConfig();

    const onClose = () => updateRoute('/');

    const {isUploading, triggerUploadModal} = useThemeUpload(themes, setCurrentTab, onClose);

    const handleUpload = () => {
        if (!uploadConfig) {
            return;
        }

        if (uploadConfig.enabled) {
            triggerUploadModal();
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

    const handleClose = () => {
        modal.remove();
        onClose();
    };

    const left = (
        <div className='hidden md:!visible md:!block'>
            <ThemeTabView currentTab={currentTab} onTabChange={setCurrentTab} />
        </div>
    );

    const right = (
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={handleClose} />
                <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
            </div>
        </div>
    );

    return (
        <>
            <PageHeader containerClassName='bg-white dark:bg-black' left={left} right={right} />
            <div className='px-[8vmin] md:hidden'>
                <ThemeTabView currentTab={currentTab} onTabChange={setCurrentTab} />
            </div>
        </>
    );
};

// ─── Marketplace Installation Hook ───────────────────────────────────────────

const useMarketplaceInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    themes: Theme[] | undefined,
    isMounted: boolean
) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: installTheme} = useInstallTheme();
    const {mutateAsync: activateTheme} = useActivateTheme();
    const {checkThemeLimitError} = useCheckThemeLimitError();
    const handleError = useHandleError();
    const modal = useModal();
    const [installedFromMarketplace, setInstalledFromMarketplace] = useState(false);

    useEffect(() => {
        if (!source || !themeRef || installedFromMarketplace || !isMounted || !themes) {
            return;
        }

        const handleUrlInstallation = async () => {
            const themeName = themeRef.split('/')[1];

            const limitError = await checkThemeLimitError(themeName);
            if (limitError) {
                modal.remove();
                return;
            }

            const existingThemeNames = themes.map(t => t.name);
            const willOverwrite = existingThemeNames.includes(themeName.toLowerCase());
            const index = existingThemeNames.indexOf(themeName.toLowerCase());
            const themeToOverwrite = themes[index];

            const prompt = (
                <>
                    By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                    {willOverwrite && (
                        <>
                            <br /><br />
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
                        if (willOverwrite) {
                            themes.splice(index, 1);
                        }
                        const data = await installTheme(themeRef);