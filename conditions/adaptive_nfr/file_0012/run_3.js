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

/** Check if theme is a default or legacy theme */
const isDefaultOrLegacyThemeName = (themeFileName: string): boolean => {
    return isDefaultOrLegacyTheme({name: themeFileName});
};

/** Check if theme already exists in installed themes */
const themeAlreadyExists = (themeFileName: string, existingThemeNames: string[]): boolean => {
    return existingThemeNames.includes(themeFileName);
};

/** Show confirmation modal for default/legacy theme upload attempt */
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

/** Show confirmation modal for theme overwrite */
const showOverwriteConfirmation = (
    themeFileName: string,
    onConfirm: (confirmModal: any) => Promise<void>
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

/** Show upload modal for new theme */
const showUploadModal = (onUpload: (file: File) => void): void => {
    NiceModal.show(ConfirmationModal, {
        title: 'Upload theme',
        prompt: <UploadModalContent onUpload={onUpload} />,
        okLabel: '',
        formSheet: false
    });
};

/** Show limit modal when theme upload is not allowed */
const showThemeLimitModal = (error: string, onUpgrade: () => void): void => {
    NiceModal.show(LimitModal, {
        title: 'Upgrade to enable custom themes',
        prompt: error || <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>,
        onOk: onUpgrade
    });
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
        const hasErrors = uploadedTheme?.errors?.length;
        const hasIssues = uploadedTheme?.errors?.length || uploadedTheme.warnings?.length;

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

        if (hasIssues) {
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
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyThemeName(themeFileName)) {
            showDefaultThemeError(themeFileName);
            return;
        }

        if (themeAlreadyExists(themeFileName, existingThemeNames)) {
            showOverwriteConfirmation(themeFileName, async (confirmModal) => {
                setUploading(true);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);
                await handleThemeUpload({file, onActivate: onClose});
                setUploading(false);
                setCurrentTab('installed');
                confirmModal?.remove();
            });
            return;
        }

        setCurrentTab('installed');
        handleThemeUpload({file, onActivate: onClose});
    };

    const handleUpload = () => {
        if (!uploadConfig) {
            return;
        }

        if (uploadConfig.enabled) {
            showUploadModal(onThemeUpload);
        } else {
            showThemeLimitModal(uploadConfig.error || '', () => updateRoute({route: '/pro', isExternal: true}));
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

/** Check if URL installation should be triggered */
const shouldHandleUrlInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    installedFromMarketplace: boolean,
    isMounted: boolean
): boolean => {
    return !!(source && themeRef && !installedFromMarketplace && isMounted);
};

/** Extract theme name from ref */
const extractThemeNameFromRef = (themeRef: string): string => {
    return themeRef.split('/')[1];
};

/** Check if theme will be overwritten */
const getThemeOverwriteInfo = (
    themeName: string,
    themes: Theme[] | undefined
): {willOverwrite: boolean; index: number; themeToOverwrite: Theme | undefined} => {
    const existingThemeNames = themes?.map(t => t.name.toLowerCase()) || [];
    const index = existingThemeNames.indexOf(themeName.toLowerCase());
    return {
        willOverwrite: index !== -1,
        index,
        themeToOverwrite: themes?.[index]
    };
};

/** Build installation confirmation prompt */
const buildInstallationPrompt = (
    themeName: string,
    willOverwrite: boolean,
    themeToOverwrite: Theme | undefined
): React.ReactNode => {
    const basePrompt = <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.</>;

    if (!willOverwrite) {
        return basePrompt;
    }

    return <>
        {basePrompt}
        <br/>
        <br/>
        This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
    </>;
};

/** Show marketplace installation confirmation */
const showMarketplaceInstallationConfirmation = (
    themeName: string,
    willOverwrite: boolean,
    themeToOverwrite: Theme | undefined,
    onConfirm: (confirmModal: any) => Promise<void>
): void => {
    NiceModal.show(ConfirmationModal, {
        title: 'Install Theme',
        prompt: buildInstallationPrompt(themeName, willOverwrite, themeToOverwrite),
        okLabel: 'Install',
        cancelLabel: 'Cancel',
        okRunningLabel: 'Installing...',
        okColor: 'black',
        onOk: onConfirm
    });
};

/** Check if theme has issues (errors or warnings) */
const themeHasIssues = (theme: Theme | InstalledTheme): boolean => {
    return !!(theme.errors?.length || theme.warnings?.length);
};

/** Build installation success prompt */
const buildInstallationSuccessPrompt = (
    theme: Theme | InstalledTheme,
    isActive: boolean
): React.ReactNode => {
    const hasErrors = theme.errors?.length;
    const basePrompt = <>
        <strong>{theme.name}</strong> has been successfully installed.
    </>;

    if (isActive) {
        return basePrompt;
    }

    return <>
        {basePrompt}{' '}
        Do you want to activate it now?
    </>;
};

/** Build installation issues prompt */
const buildInstallationIssuesPrompt = (
    theme: Theme | InstalledTheme,
    isActive: boolean
): React.ReactNode => {
    const hasErrors = theme.errors?.length;
    const basePrompt = <>
        The theme <strong>&quot;{theme.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
    </>;

    if (isActive) {
        return basePrompt;
    }

    return <>
        {basePrompt}
        You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {hasErrors ? 'errors' : 'warnings'} before