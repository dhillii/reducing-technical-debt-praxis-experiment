```typescript
import React, {useState, useMemo, useCallback} from 'react';
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

const DEFAULT_FONT = 'Theme default';

// Font to Tailwind class mapping
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
    if (fontName === DEFAULT_FONT) return '';
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) return '';
    return clsx(fontConfig.base, isHeading && fontConfig.headingWeight);
};

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
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

const Option: React.FC<OptionProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
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
    imageURL: string;
    onDelete: () => void;
    onUpload: (file: File) => Promise<void>;
    title: string;
    hint: string;
    width?: string;
    height?: string;
    editButtonClassName?: string;
    deleteButtonClassName?: string;
    imageFit?: string;
    children: string;
}

const ImageUploadField: React.FC<ImageUploadConfig & {
    onUnsplashOpen?: () => void;
    unsplashEnabled?: boolean;
    pintura?: any;
}> = ({
    id,
    imageURL,
    onDelete,
    onUpload,
    title,
    hint,
    width = '160px',
    height = '60px',
    editButtonClassName,
    deleteButtonClassName,
    imageFit,
    children,
    onUnsplashOpen,
    unsplashEnabled,
    pintura
}) => (
    <div className='flex items-start justify-between'>
        <div>
            <div>{title}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <div className={id === 'logo' ? '' : 'flex gap-3'}>
            <ImageUpload
                deleteButtonClassName={deleteButtonClassName || '!top-1 !right-1'}
                editButtonClassName={editButtonClassName}
                height={height}
                id={id}
                imageBWCheckedBg={true}
                imageFit={imageFit}
                imageURL={imageURL}
                width={width}
                onDelete={onDelete}
                onUpload={onUpload}
                openUnsplash={onUnsplashOpen}
                unsplashEnabled={unsplashEnabled}
                pintura={pintura}
                unsplashButtonClassName={id === 'cover' ? '!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50' : undefined}
            >
                {children}
            </ImageUpload>
        </div>
    </div>
);

const createImageUploadHandler = (
    uploadImage: (config: {file: File}) => Promise<any>,
    updateSetting: (key: string, value: SettingValue) => void,
    settingKey: string,
    handleError: (error: Error) => void
) => async (file: File) => {
    try {
        const uploadedImage = await uploadImage({file});
        updateSetting(settingKey, getImageUrl(uploadedImage));
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

const createFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    isHeading: boolean,
    themeNameVersion: string
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

const createFontSelectHandler = (
    fontType: 'heading' | 'body',
    setFont: (font: {name: string; creator: string}) => void,
    updateSetting: (key: string, value: SettingValue) => void,
    themeNameVersion: string
) => (option: FontSelectOption | null) => {
    const settingKey = fontType === 'heading' ? 'heading_font' : 'body_font';
    const fontArray = fontType === 'heading' ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;

    if (option?.value === DEFAULT_FONT) {
        setFont({name: DEFAULT_FONT, creator: themeNameVersion});
        updateSetting(settingKey, '');
    } else {
        const selectedFont = fontArray.find(f => f.name === option?.value);
        setFont({
            name: option?.value || '',
            creator: selectedFont?.creator || ''
        });
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
    const themeNameVersion = useMemo(
        () => activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...',
        [activeTheme]
    );

    const [headingFont, setHeadingFont] = useState(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );
    const [bodyFont, setBodyFont] = useState(
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = useMemo(
        () => createFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion),
        [themeNameVersion]
    );

    const customBodyFonts = useMemo(
        () => createFontOptions(CUSTOM_FONTS.body, false, themeNameVersion),
        [themeNameVersion]
    );

    const handleIconUpload = useCallback(
        createImageUploadHandler(uploadImage, updateSetting, 'icon', handleError),
        [uploadImage, updateSetting, handleError]
    );

    const handleLogoUpload = useCallback(
        createImageUploadHandler(uploadImage, updateSetting, 'logo', handleError),
        [uploadImage, updateSetting, handleError]
    );

    const handleCoverUpload = useCallback(
        createImageUploadHandler(uploadImage, updateSetting, 'cover_image', handleError),
        [uploadImage, updateSetting, handleError]
    );

    const handleHeadingFontSelect = useCallback(
        createFontSelectHandler('heading', setHeadingFont, updateSetting, themeNameVersion),
        [updateSetting, themeNameVersion]
    );

    const handleBodyFontSelect = useCallback(
        createFontSelectHandler('body', setBodyFont, updateSetting, themeNameVersion),
        [updateSetting, themeNameVersion]
    );

    const selectedHeadingFont = useMemo(
        () => ({label: headingFont.name, value: headingFont.name, creator: headingFont.creator}),
        [headingFont]
    );

    const selectedBodyFont = useMemo(
        () => ({label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator}),
        [bodyFont]
    );

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
                    id='icon'
                    imageURL={values.icon || ''}
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={handleIconUpload}
                    title='Publication icon'
                    hint='A square, social icon, at least 60x60px'
                    width={values.