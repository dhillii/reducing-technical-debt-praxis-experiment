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

type FontOption = {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
};

type BodyFontOption = FontOption & {value: BodyFontName | string};
type HeadingFontOption = FontOption & {value: HeadingFontName | string};

export interface GlobalSettingValues {
    description: string;
    accentColor: string;
    icon: string | null;
    logo: string | null;
    coverImage: string | null;
    headingFont: string;
    bodyFont: string;
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

const FontSingleValue: React.FC<SingleValueProps<FontOption, false>> = ({children, ...optionProps}) => (
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

const FontOption: React.FC<OptionProps<FontOption, false>> = ({children, ...optionProps}) => (
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
    value: string | null;
    width: string;
    height: string;
    onDelete: () => void;
    onUpload: (file: File) => Promise<void>;
    editButtonClassName?: string;
    deleteButtonClassName?: string;
    imageFit?: string;
    unsplashEnabled?: boolean;
    openUnsplash?: () => void;
    pintura?: {isEnabled: boolean; openEditor: () => Promise<void>};
    unsplashButtonClassName?: string;
}

const ImageUploadField: React.FC<ImageUploadConfig> = ({
    id,
    title,
    hint,
    value,
    width,
    height,
    onDelete,
    onUpload,
    ...props
}) => {
    const handleError = useHandleError();

    const handleUpload = useCallback(async (file: File) => {
        try {
            await onUpload(file);
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    }, [onUpload, handleError]);

    return (
        <div className='flex items-start justify-between'>
            <div>
                <div>{title}</div>
                <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
            </div>
            <div className={id === 'logo' ? 'flex gap-3' : ''}>
                <ImageUpload
                    id={id}
                    imageURL={value || ''}
                    width={width}
                    height={height}
                    onDelete={onDelete}
                    onUpload={handleUpload}
                    {...props}
                >
                    Upload {id}
                </ImageUpload>
            </div>
        </div>
    );
};

const GlobalSettings: React.FC<{
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
}> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();
    const {data: themesData} = useBrowseThemes();

    const themeNameVersion = useMemo(() => {
        const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
        return activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...';
    }, [themesData]);

    const [headingFont, setHeadingFont] = useState(() =>
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const [bodyFont, setBodyFont] = useState(() =>
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = useMemo<HeadingFontOption[]>(() => {
        const fonts = CUSTOM_FONTS.heading.map((x) => ({
            label: x.name,
            value: x.name,
            creator: x.creator,
            className: getFontClassName(x.name, true)
        }));
        fonts.unshift({
            label: DEFAULT_FONT,
            value: DEFAULT_FONT,
            creator: themeNameVersion,
            className: 'font-sans font-normal'
        });
        return fonts;
    }, [themeNameVersion]);

    const customBodyFonts = useMemo<BodyFontOption[]>(() => {
        const fonts = CUSTOM_FONTS.body.map((x) => ({
            label: x.name,
            value: x.name,
            creator: x.creator,
            className: getFontClassName(x.name, false)
        }));
        fonts.unshift({
            label: DEFAULT_FONT,
            value: DEFAULT_FONT,
            creator: themeNameVersion,
            className: 'font-sans font-normal'
        });
        return fonts;
    }, [themeNameVersion]);

    const handleImageUpload = useCallback(async (file: File) => {
        return getImageUrl(await uploadImage({file}));
    }, [uploadImage]);

    const handleHeadingFontSelect = useCallback((option: FontOption | null) => {
        if (option?.value === DEFAULT_FONT) {
            setHeadingFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting('heading_font', '');
        } else if (option?.value) {
            const font = CUSTOM_FONTS.heading.find(f => f.name === option.value);
            setHeadingFont({name: option.value, creator: font?.creator || ''});
            updateSetting('heading_font', option.value);
        }
    }, [themeNameVersion, updateSetting]);

    const handleBodyFontSelect = useCallback((option: FontOption | null) => {
        if (option?.value === DEFAULT_FONT) {
            setBodyFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting('body_font', '');
        } else if (option?.value) {
            const font = CUSTOM_FONTS.body.find(f => f.name === option.value);
            setBodyFont({name: option.value, creator: font?.creator || ''});
            updateSetting('body_font', option.value);
        }
    }, [themeNameVersion, updateSetting]);

    const selectedHeadingFont = useMemo(() => ({
        label: headingFont.name,
        value: headingFont.name,
        creator: headingFont.creator
    }), [headingFont]);

    const selectedBodyFont = useMemo(() => ({
        label: bodyFont.name,
        value: bodyFont.name,
        creator: bodyFont.creator
    }), [bodyFont]);

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
                    value={values.icon}
                    width={values.icon ? '66px' : '160px'}
                    height={values.icon ? '66px' : '36px'}
                    deleteButtonClassName='!top-1 !right-1'
                    editButtonClassName='!top-1 !right-1'
                    imageBWCheckedBg={true}
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={async (file) => {
                        const url = await handleImageUpload(file);
                        updateSetting('icon', url);
                    }}
                />
                <ImageUploadField
                    id='site-logo'
                    title='Publication logo'
                    hint='Appears usually in the main header of your theme'
                    value={values.logo}
                    width='160px'
                    height='60px'
                    deleteButtonClassName='!top-1 !right-1'
                    imageBWCheckedBg={true}
                    imageFit='contain'
                    onDelete={() => updateSetting('logo', null)}
                    onUpload={async (file) => {
                        const url = await handleImageUpload(file);
                        updateSetting('logo', url);
                    }}
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