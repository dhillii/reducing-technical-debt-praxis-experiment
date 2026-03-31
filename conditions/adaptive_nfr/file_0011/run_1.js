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
 * All custom fonts are maintained in the @tryghost/custom-fonts package.
 * If you need to change a font, you'll need to update the @tryghost/custom-fonts package.
 *
 * TODO: We tried to use the getCSSFriendlyFontClassName function from the @tryghost/custom-fonts package,
 * but this is not working with Tailwind CSS, as tailwind requires to have the class name already in the
 * file to be able to generate the styles.
 * So we need to manually map the font names to the corresponding Tailwind CSS class names.
 */
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

const fontClassName = (fontName: string, heading: boolean = true): string => {
    const entry = FONT_CLASS_MAP[fontName];
    if (!entry) {
        return '';
    }
    return clsx(entry.base, heading && entry.headingWeight);
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
        <div
            className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'}
            data-testid="select-option"
            data-value={optionProps.data.value}
        >
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

const buildFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    heading: boolean,
    themeNameVersion: string
): Array<HeadingFontOption | BodyFontOption> => {
    const options = fonts.map(x => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: fontClassName(x.name, heading)
    }));
    return [{label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'}, ...options];
};

const selectFontClassName = (fontName: string, heading: boolean): string => {
    if (fontName === DEFAULT_FONT) {
        return '';
    }
    return fontClassName(fontName, heading);
};

interface ImageUploadFieldProps {
    label: string;
    hint: string;
    id: string;
    imageURL: string;
    settingKey: string;
    height?: string;
    width?: string;
    imageFit?: 'contain' | 'cover';
    imageBWCheckedBg?: boolean;
    deleteButtonClassName?: string;
    editButtonClassName?: string;
    children: React.ReactNode;
    onUpload: (file: File) => Promise<void>;
    onDelete: () => void;
    extraContent?: React.ReactNode;
    wrapperClassName?: string;
    'data-testid'?: string;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
    label,
    hint,
    id,
    imageURL,
    height,
    width,
    imageFit,
    imageBWCheckedBg,
    deleteButtonClassName,
    editButtonClassName,
    children,
    onUpload,
    onDelete,
    extraContent,
    wrapperClassName,
    'data-testid': testId
}) => (
    <div className={clsx('flex items-start justify-between', wrapperClassName)} data-testid={testId}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <div className='flex gap-3'>
            <ImageUpload
                deleteButtonClassName={deleteButtonClassName}
                editButtonClassName={editButtonClassName}
                height={height}
                id={id}
                imageBWCheckedBg={imageBWCheckedBg}
                imageFit={imageFit}
                imageURL={imageURL}
                width={width}
                onDelete={onDelete}
                onUpload={onUpload}
            >
                {children}
            </ImageUpload>
            {extraContent}
        </div>
    </div>
);

const useImageUploadHandler = (
    uploadImage: (args: {file: File}) => Promise<unknown>,
    handleError: (e: unknown) => void
) => {
    return async (file: File, onSuccess: (url: string) => void) => {
        try {
            onSuccess(getImageUrl(await uploadImage({file})));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };
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

    const handleImageUpload = useImageUploadHandler(uploadImage, handleError);

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion) as HeadingFontOption[];
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion) as BodyFontOption[];

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleFontSelect = (
        option: FontSelectOption | null,
        isHeading: boolean,
        fontList: Array<{name: string; creator: string}>,
        setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
        settingKey: string
    ) => {
        if (option?.value === DEFAULT_FONT || !option) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            const creator = fontList.find(f => f.name === option.value)?.creator || '';
            setFont({name: option.value, creator});
            updateSetting(settingKey, option.value);
        }
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
                    deleteButtonClassName='!top-1 !right-1'
                    editButtonClassName='!top-1 !right-1'
                    height={values.icon ? '66px' : '36px'}
                    hint='A square, social icon, at least 60x60px'
                    id='logo'
                    imageBWCheckedBg={true}
                    imageURL={values.icon || ''}
                    label='Publication icon'
                    width={values.icon ? '66px' : '160px'}
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={file => handleImageUpload(file, url => updateSetting('icon', url))}
                >
                    Upload icon
                </ImageUploadField>
                <ImageUploadField
                    deleteButtonClassName='!top-1 !right-1'
                    height='60px'
                    hint='Appears usually in the main header of your theme'
                    id='site-logo'
                    imageBWCheckedBg={true}
                    imageFit='contain'
                    imageURL={values.logo || ''}
                    label='Publication logo'
                    width='160px'
                    wrapperClassName={values.icon ? 'mt-2' : undefined}
                    onDelete={() => updateSetting('logo', null)}
                    onUpload={file => handleImageUpload(file, url => updateSetting('logo', url))}
                >
                    Upload logo
                </ImageUploadField>
                <div className='mt-2