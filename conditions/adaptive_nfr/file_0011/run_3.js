```tsx
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

const DEFAULT_FONT = 'Theme default';

type BodyFontOption = {
    value: BodyFontName | typeof DEFAULT_FONT;
    label: BodyFontName | typeof DEFAULT_FONT;
    creator?: string;
    className?: string;
};

type HeadingFontOption = {
    value: HeadingFontName | typeof DEFAULT_FONT;
    label: HeadingFontName | typeof DEFAULT_FONT;
    creator?: string;
    className?: string;
};

export interface GlobalSettingValues {
    description: string;
    accentColor: string;
    icon: string | null;
    logo: string | null;
    coverImage: string | null;
    headingFont: string;
    bodyFont: string;
}

interface FontSelectOption {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
}

/**
 * Font name → [tailwind-font-class, heading-weight-class, body-weight-class]
 * All custom fonts are maintained in the @tryghost/custom-fonts package.
 * Tailwind requires class names to be present in source files to generate styles,
 * so we cannot use getCSSFriendlyFontClassName from that package.
 */
const FONT_CLASS_MAP: Record<string, [string, string, string]> = {
    'Cardo':           ['font-cardo',          'font-bold',    'font-bold'],
    'Manrope':         ['font-manrope',         'font-bold',    'font-bold'],
    'Merriweather':    ['font-merriweather',    'font-bold',    'font-bold'],
    'Nunito':          ['font-nunito',          'font-semibold','font-semibold'],
    'Old Standard TT': ['font-old-standard-tt', 'font-bold',    'font-bold'],
    'Prata':           ['font-prata',           'font-normal',  'font-normal'],
    'Roboto':          ['font-roboto',          'font-bold',    'font-bold'],
    'Rufina':          ['font-rufina',          'font-bold',    'font-bold'],
    'Tenor Sans':      ['font-tenor-sans',      'font-normal',  'font-normal'],
    'Chakra Petch':    ['font-chakra-petch',    'font-normal',  'font-normal'],
    'Fira Mono':       ['font-fira-mono',       'font-bold',    'font-bold'],
    'Fira Sans':       ['font-fira-sans',       'font-bold',    'font-bold'],
    'IBM Plex Serif':  ['font-ibm-plex-serif',  'font-bold',    'font-bold'],
    'Inter':           ['font-inter',           'font-bold',    'font-bold'],
    'JetBrains Mono':  ['font-jetbrains-mono',  'font-bold',    'font-bold'],
    'Lora':            ['font-lora',            'font-bold',    'font-bold'],
    'Noto Sans':       ['font-noto-sans',       'font-bold',    'font-bold'],
    'Noto Serif':      ['font-noto-serif',      'font-bold',    'font-bold'],
    'Poppins':         ['font-poppins',         'font-bold',    'font-bold'],
    'Space Grotesk':   ['font-space-grotesk',   'font-bold',    'font-bold'],
    'Space Mono':      ['font-space-mono',      'font-bold',    'font-bold'],
};

const fontClassName = (fontName: string, heading: boolean = true): string => {
    const entry = FONT_CLASS_MAP[fontName];
    if (!entry) {
        return '';
    }
    const [baseClass, headingWeight, bodyWeight] = entry;
    return clsx(baseClass, heading ? headingWeight : bodyWeight);
};

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// ─── Font Select Components ───────────────────────────────────────────────────

const FontPreviewBox: React.FC<{isSelected?: boolean}> = ({isSelected = false}) => (
    <div className={clsx(
        'flex size-12 items-center justify-center rounded-md text-2xl font-bold',
        isSelected
            ? 'bg-white dark:bg-black'
            : 'bg-grey-150 group-hover:bg-grey-250 dark:bg-grey-900 dark:group-hover:bg-grey-800'
    )}>
        Aa
    </div>
);

const FontLabel: React.FC<{label: React.ReactNode; creator?: string}> = ({label, creator}) => (
    <div className='flex flex-col'>
        <span className='text-md'>{label}</span>
        <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{creator}</span>
    </div>
);

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid='select-current-option' data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <FontPreviewBox isSelected />
                <FontLabel creator={optionProps.data.creator} label={children} />
            </div>
        </div>
    </components.SingleValue>
);

const Option: React.FC<OptionProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.Option {...optionProps}>
        <div
            className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'}
            data-testid='select-option'
            data-value={optionProps.data.value}
        >
            <div className='flex items-center gap-3'>
                <FontPreviewBox />
                <FontLabel creator={optionProps.data.creator} label={children} />
            </div>
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

// ─── Image Upload Helpers ─────────────────────────────────────────────────────

type UploadImageFn = (args: {file: File}) => Promise<unknown>;

const handleImageUploadError = (e: unknown, handleError: (e: unknown) => void) => {
    const error = e as APIError;
    if (error.response?.status === 415) {
        error.message = 'Unsupported file type';
    }
    handleError(error);
};

const createImageUploadHandler = (
    settingKey: string,
    uploadImage: UploadImageFn,
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (e: unknown) => void
) => async (file: File) => {
    try {
        updateSetting(settingKey, getImageUrl(await uploadImage({file})));
    } catch (e) {
        handleImageUploadError(e, handleError);
    }
};

// ─── Font Option Builders ─────────────────────────────────────────────────────

const buildFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    heading: boolean,
    themeNameVersion: string
): Array<HeadingFontOption | BodyFontOption> => {
    const options = fonts.map(x => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: fontClassName(x.name, heading),
    }));
    options.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal',
    });
    return options as Array<HeadingFontOption | BodyFontOption>;
};

// ─── Publication Image Row ────────────────────────────────────────────────────

interface PublicationImageRowProps {
    label: string;
    hint: string;
    className?: string;
    children: React.ReactNode;
}

const PublicationImageRow: React.FC<PublicationImageRowProps> = ({label, hint, className, children}) => (
    <div className={clsx('flex items-start justify-between', className)}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        {children}
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const GlobalSettings: React.FC<{
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
}> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
        : 'Loading...';

    const [headingFont, setHeadingFont] = useState(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );
    const [bodyFont, setBodyFont] = useState(
        CUSTOM_FONTS.heading.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion);
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleFontSelect = (
        option: FontSelectOption | null,
        type: 'heading' | 'body',
        setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>
    ) => {
        const settingKey = type === 'heading' ? 'heading_font' : 'body_font';
        const fontList = type === 'heading' ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;

        if (!option || option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            setFont({
                name: option.value,
                creator: fontList.find(f => f.name === option.value)?.creator || '',
            });
            updateSetting(settingKey, option.value);
        }
    };

    const selectFontClass = (fontName: string, heading: boolean) =>
        fontName === DEFAULT_FONT ? '' : fontClassName(fontName, heading);

    const uploadIcon = createImageUploadHandler('icon', uploadImage, updateSetting, handleError);
    const uploadLogo = createImageUploadHandler('logo', uploadImage, updateSetting, handleError);
    const uploadCover = createImageUploadHandler('cover_image', uploadImage, updateSetting, handleError);

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

                <PublicationImageRow hint='A square, social icon, at least 60x60px' label='Publication icon'>
                    <div className='flex gap-3'>
                        <ImageUpload
                            deleteButtonClassName='!top-1 !right-1'
                            editButtonClassName='!top-1 !right-1'
                            height={values.icon ? '66px' : '36px'}
                            id='logo'
                            imageBWCheckedBg={true}
                            imageURL={values.icon || ''}
                            width={values.icon ? '66px' : '160px'}
                            onDelete={() => updateSetting('icon', null)}
                            onUpload={uploadIcon}
                        >
                            Upload icon
                        </ImageUpload>
                    </div>
                </PublicationImageRow>

                <PublicationImageRow
                    className={values.icon ? 'mt-2' : undefined}
                    hint='Appears usually in the main header of your theme'
                    label='Publication logo'
                >
                    <ImageUpload
                        deleteButtonClassName='!top-1 !right-1'
                        height='60px'
                        id='site-logo'
                        imageBWCheckedBg={true}
                        imageFit='contain'
                        imageURL={values.logo || ''}
                        width='160px'
                        onDelete={() => updateSetting('logo', null)}
                        onUpload={uploadLogo}
                    >
                        Upload logo
                    </ImageUpload>
                </PublicationImageRow>

                <div className='mt-2 flex items-start justify-between' data-testid='publication-cover'>
                    <div>
                        <div>Publication cover</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Usually as a large banner image on your index pages</Hint>
                    </div>