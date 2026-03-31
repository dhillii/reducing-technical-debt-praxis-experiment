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

const DEFAULT_FONT = 'Theme default';

interface FontSelectOption {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
}

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

const capitalizeWords = (str: string): string => str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const fontClassName = (fontName: string, heading: boolean = true): string => {
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) return '';
    return clsx(fontConfig.base, heading && fontConfig.headingWeight);
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
    width: string;
    height: string;
    imageURL: string;
    onDelete: () => void;
    onUpload: (file: File) => Promise<void>;
    label: string;
    hint: string;
    deleteButtonClassName?: string;
    editButtonClassName?: string;
    imageFit?: string;
    pintura?: any;
    unsplashEnabled?: boolean;
    unsplashButtonClassName?: string;
    openUnsplash?: () => void;
}

const ImageUploadField: React.FC<ImageUploadConfig & {handleError: (error: APIError) => void}> = ({
    id,
    width,
    height,
    imageURL,
    onDelete,
    onUpload,
    label,
    hint,
    handleError,
    ...props
}) => {
    const handleImageUpload = useCallback(async (file: File) => {
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
                <div>{label}</div>
                <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
            </div>
            <div className={id === 'logo' ? 'flex gap-3' : ''}>
                <ImageUpload
                    id={id}
                    width={width}
                    height={height}
                    imageURL={imageURL}
                    onDelete={onDelete}
                    onUpload={handleImageUpload}
                    deleteButtonClassName='!top-1 !right-1'
                    {...props}
                >
                    Upload {label.toLowerCase()}
                </ImageUpload>
            </div>
        </div>
    );
};

const GlobalSettings: React.FC<{ values: GlobalSettingValues, updateSetting: (key: string, value: SettingValue) => void }> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...';

    const [headingFont, setHeadingFont] = useState(CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion});
    const [bodyFont, setBodyFont] = useState(CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion});

    const customHeadingFonts = useMemo(() => {
        const fonts: HeadingFontOption[] = CUSTOM_FONTS.heading.map((x) => ({
            label: x.name,
            value: x.name,
            creator: x.creator,
            className: fontClassName(x.name, true)
        }));
        fonts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'});
        return fonts;
    }, [themeNameVersion]);

    const customBodyFonts = useMemo(() => {
        const fonts: BodyFontOption[] = CUSTOM_FONTS.body.map((x) => ({
            label: x.name,
            value: x.name,
            creator: x.creator,
            className: fontClassName(x.name, false)
        }));
        fonts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'});
        return fonts;
    }, [themeNameVersion]);

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

    const handleHeadingFontSelect = useCallback((option: FontSelectOption | null) => {
        if (option?.value === DEFAULT_FONT) {
            setHeadingFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting('heading_font', '');
        } else {
            const selectedFont = CUSTOM_FONTS.heading.find(f => f.name === option?.value);
            setHeadingFont({name: option?.value || '', creator: selectedFont?.creator || ''});
            updateSetting('heading_font', option?.value || '');
        }
    }, [themeNameVersion, updateSetting]);

    const handleBodyFontSelect = useCallback((option: FontSelectOption | null) => {
        if (option?.value === DEFAULT_FONT) {
            setBodyFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting('body_font', '');
        } else {
            const selectedFont = CUSTOM_FONTS.body.find(f => f.name === option?.value);
            setBodyFont({name: option?.value || '', creator: selectedFont?.creator || ''});
            updateSetting('body_font', option?.value || '');
        }
    }, [themeNameVersion, updateSetting]);

    const handleImageUpload = useCallback(async (file: File) => {
        return getImageUrl(await uploadImage({file}));
    }, [uploadImage]);

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
                    width={values.icon ? '66px' : '160px'}
                    height={values.icon ? '66px' : '36px'}
                    imageURL={values.icon || ''}
                    label='Publication icon'
                    hint='A square, social icon, at least 60x60px'
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={async (file) => {
                        const url = await handleImageUpload(file);
                        updateSetting('icon', url);
                    }}
                    handleError={handleError}
                    imageBWCheckedBg={true}
                />
                <ImageUploadField
                    id='site-logo'
                    width='160px'
                    height='60px'
                    imageURL={values.logo || ''}
                    label='Publication logo'
                    hint='Appears usually in the main header of your theme'
                    onDelete={() => updateSetting('logo', null)}
                    onUpload={async (file) => {
                        const url = await handleImageUpload(file);
                        updateSetting('logo', url);
                    }}
                    handleError={handleError}
                    imageBWCheckedBg={true}
                    imageFit='contain'
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
                        openUnsplash={() => setShowUnsplash(