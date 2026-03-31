```typescript
import React, {useState} from 'react';
import UnsplashSelector from '../../../selectors/unsplash-selector';
import clsx from 'clsx';
import usePinturaEditor from '../../../../hooks/use-pintura-editor';
import {APIError} from '@tryghost/admin-x-framework/errors';
import {CUSTOM_FONTS} from '@tryghost/custom-fonts';
import {ColorPickerField, Form, Hint, ImageUpload, Select} from '@tryghost/admin-x-design-system';
import {Icon} from '@tryghost/admin-x-design-system';
import {type OptionProps, type SingleValueProps, components} from 'react-select';
import {type SettingValue, getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {type Theme, useBrowseThemes} from '@tryghost/admin-x-framework/api/themes';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useFramework} from '@tryghost/admin-x-framework';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import type {BodyFontName, HeadingFontName} from '@tryghost/custom-fonts';

type BodyFontOption = {
    value: BodyFontName | typeof DEFAULT_FONT,
    label: BodyFontName | typeof DEFAULT_FONT,
    creator?: string,
    className?: string
};

type HeadingFontOption = {
    value: HeadingFontName | typeof DEFAULT_FONT,
    label: HeadingFontName | typeof DEFAULT_FONT,
    creator?: string,
    className?: string
};

export interface GlobalSettingValues {
    description: string
    accentColor: string
    icon: string | null
    logo: string | null
    coverImage: string | null
    headingFont: string
    bodyFont: string
}

interface FontSelectOption {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
}

interface FontConfig {
    name: string;
    creator: string;
}

const DEFAULT_FONT = 'Theme default';

const FONT_CLASS_MAP: Record<string, {base: string; headingWeight: string}> = {
    'Cardo': {base: 'font-cardo', headingWeight: 'font-bold'},
    'Manrope': {base: 'font-manrope', headingWeight: 'font-bold'},
    'Merriweather': {base: 'font-merriweather', headingWeight: 'font-bold'},
    'Nunito': {base: 'font-nunito', headingWeight: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold'},
    'Prata': {base: 'font-prata', headingWeight: 'font-normal'},
    'Roboto': {base: 'font-roboto', headingWeight: 'font-bold'},
    'Rufina': {base: 'font-rufina', headingWeight: 'font-bold'},
    'Tenor Sans': {base: 'font-tenor-sans', headingWeight: 'font-normal'},
    'Chakra Petch': {base: 'font-chakra-petch', headingWeight: 'font-normal'},
    'Fira Mono': {base: 'font-fira-mono', headingWeight: 'font-bold'},
    'Fira Sans': {base: 'font-fira-sans', headingWeight: 'font-bold'},
    'IBM Plex Serif': {base: 'font-ibm-plex-serif', headingWeight: 'font-bold'},
    'Inter': {base: 'font-inter', headingWeight: 'font-bold'},
    'JetBrains Mono': {base: 'font-jetbrains-mono', headingWeight: 'font-bold'},
    'Lora': {base: 'font-lora', headingWeight: 'font-bold'},
    'Noto Sans': {base: 'font-noto-sans', headingWeight: 'font-bold'},
    'Noto Serif': {base: 'font-noto-serif', headingWeight: 'font-bold'},
    'Poppins': {base: 'font-poppins', headingWeight: 'font-bold'},
    'Space Grotesk': {base: 'font-space-grotesk', headingWeight: 'font-bold'},
    'Space Mono': {base: 'font-space-mono', headingWeight: 'font-bold'}
};

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    if (fontName === DEFAULT_FONT) {
        return 'font-sans font-normal';
    }
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) return '';
    return clsx(fontConfig.base, isHeading && fontConfig.headingWeight);
};

const FontSingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid="select-current-option" data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <div className='flex size-12 items-center justify-center rounded-md bg-white text-2xl font-bold dark:bg-black'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{optionProps.data.creator}</span>
                </div>
            </div>
        </div>
    </components.SingleValue>
);

const FontOption: React.FC<OptionProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.Option {...optionProps}>
        <div className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'} data-testid="select-option" data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{optionProps.data.creator}</span>
                </div>
            </div>
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

interface ImageUploadConfig {
    id: string;
    title: string;
    hint: string;
    imageUrl: string | null;
    onDelete: () => void;
    onUpload: (file: File) => Promise<void>;
    editButtonClassName?: string;
    unsplashButton?: boolean;
    onUnsplashClick?: () => void;
}

const ImageUploadField: React.FC<ImageUploadConfig> = ({
    id,
    title,
    hint,
    imageUrl,
    onDelete,
    onUpload,
    editButtonClassName,
    unsplashButton,
    onUnsplashClick
}) => (
    <div className='flex items-start justify-between'>
        <div>
            <div>{title}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <div className={imageUrl ? 'mt-2' : ''}>
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                editButtonClassName={editButtonClassName}
                height={imageUrl ? '60px' : '36px'}
                id={id}
                imageBWCheckedBg={true}
                imageFit='contain'
                imageURL={imageUrl || ''}
                width={imageUrl ? '160px' : '160px'}
                onDelete={onDelete}
                onUpload={onUpload}
            >
                Upload {id}
            </ImageUpload>
        </div>
    </div>
);

const handleImageUpload = async (
    file: File,
    uploadImage: (config: {file: File}) => Promise<string>,
    updateSetting: (key: string, value: SettingValue) => void,
    settingKey: string,
    handleError: (error: Error) => void
) => {
    try {
        const uploadedUrl = getImageUrl(await uploadImage({file}));
        updateSetting(settingKey, uploadedUrl);
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

const buildFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    themeNameVersion: string,
    isHeading: boolean
): (HeadingFontOption | BodyFontOption)[] => {
    const options = fonts.map((font) => ({
        label: font.name,
        value: font.name,
        creator: font.creator,
        className: getFontClassName(font.name, isHeading)
    }));
    options.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    return options;
};

const handleFontSelect = (
    option: FontSelectOption | null,
    isHeading: boolean,
    themeNameVersion: string,
    setFont: (config: FontConfig) => void,
    updateSetting: (key: string, value: SettingValue) => void
) => {
    const fontList = isHeading ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;
    const settingKey = isHeading ? 'heading_font' : 'body_font';

    if (option?.value === DEFAULT_FONT) {
        setFont({name: DEFAULT_FONT, creator: themeNameVersion});
        updateSetting(settingKey, '');
    } else {
        const fontCreator = fontList.find(f => f.name === option?.value)?.creator || '';
        setFont({name: option?.value || '', creator: fontCreator});
        updateSetting(settingKey, option?.value || '');
    }
};

interface GlobalSettingsProps {
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
}

const GlobalSettings: React.FC<GlobalSettingsProps> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
        : 'Loading...';

    const [headingFont, setHeadingFont] = useState<FontConfig>(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );
    const [bodyFont, setBodyFont] = useState<FontConfig>(
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, themeNameVersion, true);
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, themeNameVersion, false);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleCoverImageUpload = async (file: File) => {
        await handleImageUpload(file, uploadImage, updateSetting, 'cover_image', handleError);
    };

    const handleIconUpload = async (file: File) => {
        await handleImageUpload(file, uploadImage, updateSetting, 'icon', handleError);
    };

    const handleLogoUpload = async (file: File) => {
        await handleImageUpload(file, uploadImage, updateSetting, 'logo', handleError);
    };

    return (
        <>
            <Form className='mt-6' gap='sm' margins='lg' title=''>
                <ColorPickerField
                    debounceMs={200}
                    direction='rtl'
                    testId='accent-color-picker'
                    title={<div>Accent color</div>}
                    value={values.accentColor}
                    onChange={value => updateSetting('accent_color', value)}
                />
                <ImageUploadField
                    id='logo'
                    title='Publication icon'
                    hint='A square, social icon, at least 60x60px'
                    imageUrl={values.icon}
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={handleIconUpload}
                />
                <ImageUploadField
                    id='site-logo'
                    title='Publication logo'
                    hint='Appears usually in the main header of your theme'
                    imageUrl={values.logo}
                    onDelete={() => updateSetting('logo', null)}
                    onUpload={handleLogoUpload}
                />
                <div className='mt-2 flex items-start justify-between' data-testid="publication-cover">
                    <div>
                        <div>Publication cover</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Usually as a large banner image on your index pages</Hint>
                    </div>
                    <ImageUpload
                        deleteButtonClassName='!top-1 !right-1'
                        editButtonClassName='!top-1 !right-10'
                        height='95px'
                        id='cover'
                        imageURL={values.coverImage || ''}
                        openUnsplash={() => setShowUnsplash(true)}
                        pintura={{
                            isEnabled: editor.isEnabled,
                            openEditor: async () => editor.openEditor({
                                image: values.coverImage || '',
                                handleSave: async (file: File) => {
                                    try {
                                        updateSetting('cover_image', getImageUrl(await uploadImage({file})));
                                    } catch (e) {
                                        handleError(e);
                                    }