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

const TABS = [
    {id: 'official', title: 'Official themes'},
    {id: 'installed', title: 'Installed'}
] as const;

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

    const [uploadConfig, setUploadConfig] = useState<UploadConfig | undefined>();
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
                const index = themes.findIndex(t => t.name === themeFileName);
                if (index !== -1) {
                    themes.splice(index, 1);
                }
                await onConfirm();
                setUploading(false);
                setCurrentTab('installed');
                confirmModal?.remove();
            }
        });
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
        const hasErrors = uploadedTheme?.errors?.length;
        const hasWarnings = uploadedTheme?.warnings?.length;

        let title = 'Upload successful';
        let prompt: React.ReactNode = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (hasErrors || hasWarnings) {
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
        } else if (!uploadedTheme.active) {
            prompt = <>
                {prompt}{' '}
                Do you want to activate it now?
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

    const left = (
        <div className='hidden md:!visible md:!block'>
            <TabView
                border={false}
                selectedTab={currentTab}
                tabs={TABS}
                onTabChange={setCurrentTab}
            />
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
                <TabView
                    border={false}
                    selectedTab={currentTab}
                    tabs={TABS}
                    onTabChange={setCurrentTab}
                />
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

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

const ChangeThemeModal: React.FC<ChangeThemeModalProps> = ({source, themeRef}) => {
    const [currentTab, setCurrentTab] = useState('official');
    const [selectedTheme, setSelectedTheme] = useState<OfficialTheme|null>(null);
    const [previewMode, setPreviewMode] = useState('desktop');
    const [installState, setInstallState] = useState<ThemeInstallationState>({
        isInstalling: false,
        installedFromMarketplace: false,
        isMounted: false
    });

    const {updateRoute} = useRouting();
    const modal = useModal();
    const {data: {themes} = {}} = useBrowseThemes();
    const {mutateAsync: installTheme} = useInstallTheme();
    const {mutateAsync: activateTheme} = useActivateTheme();
    const {checkThemeLimitError} = useCheckThemeLimitError();
    const handleError = useHandleError();

    useEffect(() => {
        setInstallState(prev => ({...prev, isMounted: true}));
    }, []);

    const handleUrlInstallation = async () => {
        if (!source || !themeRef || installState.installedFromMarketplace || !installState.isMounted || !themes) {
            return;
        }

        const themeName = themeRef.split('/')[1];
        const limitError = await checkThemeLimitError(themeName);

        if (limitError) {
            modal.remove();
            return;
        }

        const existingThemeNames = themes.map(t => t.name.toLowerCase());
        const willOverwrite = existingThemeNames.includes(themeName.toLowerCase());
        const index = existingThemeNames.indexOf(themeName.toLowerCase());
        const themeToOverwrite = themes[index];

        const prompt = (
            <>
                By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                {willOverwrite && (
                    <>
                        <br/>
                        <br/>
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
                        themes.splice(index, 1);
                    }
                    const data = await installTheme(themeRef);
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
                    setInstallState(prev => ({...prev, installedFromMarketplace: true}));
                } catch (e) {
                    handleError(e);
                }
            }
        });
    };

    useEffect(() => {
        handleUrlInstallation();
    }, [themeRef, source, installState.isMounted, installState.installedFromMarketplace]);

    if (!themes) {
        return null;
    }

    const onSelectTheme = (theme: OfficialTheme|null) => {
        setSelectedTheme(theme);
    };

    let installedTheme: Theme|InstalledTheme|undefined;
    let onInstall: (() => Promise<void>) | undefined;

    if (selectedTheme) {
        installedTheme = themes.find(theme => theme.name.toLowerCase() === selectedTheme.name.toLowerCase());

        const performInstallation = async () => {
            if (isDefaultOrLegacyTheme(selectedTheme)) {
                NiceModal.show(ThemeInstalledModal, {
                    title: 'Activate theme',
                    prompt: <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>,
                    installedTheme: installedTheme!,
                    onActivate: () => updateRoute('')
                });
                return;
            }

            setInstallState(prev => ({...prev, isInstalling: true}));
            let data: ThemesInstallResponseType | undefined;

            try {
                data = await installTheme(selectedTh