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

const DEFAULT_FONT = 'Theme default';

interface FontSelectOption {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
}

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

const capitalizeWords = (str: string): string => str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Mapping of font names to Tailwind CSS class names for heading and body.
 */
const FONT_CLASS_MAP: Record<string, {heading: string; body: string}> = {
    Cardo: {heading: 'font-cardo font-bold', body: 'font-cardo'},
    Manrope: {heading: 'font-manrope font-bold', body: 'font-manrope'},
    Merriweather: {heading: 'font-merriweather font-bold', body: 'font-merriweather'},
    Nunito: {heading: 'font-nunito font-semibold', body: 'font-nunito'},
    'Old Standard TT': {heading: 'font-old-standard-tt font-bold', body: 'font-old-standard-tt'},
    Prata: {heading: 'font-prata font-normal', body: 'font-prata'},
    Roboto: {heading: 'font-roboto font-bold', body: 'font-roboto'},
    Rufina: {heading: 'font-rufina font-bold', body: 'font-rufina'},
    'Tenor Sans': {heading: 'font-tenor-sans font-normal', body: 'font-tenor-sans'},
    'Chakra Petch': {heading: 'font-chakra-petch font-normal', body: 'font-chakra-petch'},
    'Fira Mono': {heading: 'font-fira-mono font-bold', body: 'font-fira-mono'},
    'Fira Sans': {heading: 'font-fira-sans font-bold', body: 'font-fira-sans'},
    'IBM Plex Serif': {heading: 'font-ibm-plex-serif font-bold', body: 'font-ibm-plex-serif'},
    Inter: {heading: 'font-inter font-bold', body: 'font-inter'},
    'JetBrains Mono': {heading: 'font-jetbrains-mono font-bold', body: 'font-jetbrains-mono'},
    Lora: {heading: 'font-lora font-bold', body: 'font-lora'},
    'Noto Sans': {heading: 'font-noto-sans font-bold', body: 'font-noto-sans'},
    'Noto Serif': {heading: 'font-noto-serif font-bold', body: 'font-noto-serif'},
    Poppins: {heading: 'font-poppins font-bold', body: 'font-poppins'},
    'Space Grotesk': {heading: 'font-space-grotesk font-bold', body: 'font-space-grotesk'},
    'Space Mono': {heading: 'font-space-mono font-bold', body: 'font-space-mono'}
};

/**
 * Returns the CSS class name for a given font and whether it is used as a heading.
 */
const getFontClass = (fontName: string, heading: boolean): string => {
    const mapping = FONT_CLASS_MAP[fontName];
    if (!mapping) return '';
    return heading ? mapping.heading : mapping.body;
};

/**
 * Builds an array of font options for the Select component.
 */
const buildFontOptions = (
    fonts: {name: string; creator: string}[],
    heading: boolean,
    themeNameVersion: string
): FontSelectOption[] => {
    const options = fonts.map(f => ({
        label: f.name,
        value: f.name,
        creator: f.creator,
        className: getFontClass(f.name, heading)
    }));
    options.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    return options;
};

/**
 * Handles the selection of a font in the Select component.
 */
const createFontSelectHandler = (
    isHeading: boolean,
    setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
    updateSetting: (key: string, value: SettingValue) => void,
    themeNameVersion: string
) => {
    return (option: FontSelectOption | null) => {
        if (!option) return;
        if (option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(isHeading ? 'heading_font' : 'body_font', '');
        } else {
            const fontList = isHeading ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;
            const font = fontList.find(f => f.name === option.value);
            setFont({name: option.value, creator: font?.creator ?? ''});
            updateSetting(isHeading ? 'heading_font' : 'body_font', option.value);
        }
    };
};

/**
 * Creates an async upload handler for an image field.
 */
const createUploadHandler = (
    field: string,
    updateSetting: (key: string, value: SettingValue) => void,
    uploadImage: (args: {file: File}) => Promise<string>,
    handleError: (error: unknown) => void
) => {
    return async (file: File) => {
        try {
            const url = await uploadImage({file});
            updateSetting(field, getImageUrl(url));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };
};

/**
 * Renders an ImageUpload component with common props.
 */
const renderImageUpload = (
    field: string,
    value: string | null,
    updateSetting: (key: string, value: SettingValue) => void,
    uploadImage: (args: {file: File}) => Promise<string>,
    handleError: (error: unknown) => void,
    height: string | number,
    width: string | number,
    id: string,
    deleteText: string,
    uploadText: string,
    extraProps: Partial<React.ComponentProps<typeof ImageUpload>> = {}
) => {
    const onDelete = () => updateSetting(field, null);
    const onUpload = createUploadHandler(field, updateSetting, uploadImage, handleError);
    return (
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            editButtonClassName='!top-1 !right-1'
            height={height}
            id={id}
            imageBWCheckedBg={true}
            imageURL={value ?? ''}
            width={width}
            onDelete={onDelete}
            onUpload={onUpload}
            {...extraProps}
        >
            {uploadText}
        </ImageUpload>
    );
};

const GlobalSettings: React.FC<{ values: GlobalSettingValues; updateSetting: (key: string, value: SettingValue) => void }> = ({values, updateSetting}) => {
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

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion);
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const selectFontClass = (fontName: string, heading: boolean) => {
        if (fontName === DEFAULT_FONT) return '';
        return getFontClass(fontName, heading);
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
                <div className='flex items-start justify-between'>
                    <div>
                        <div>Publication icon</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>A square, social icon, at least 60x60px</Hint>
                    </div>
                    <div className='flex gap-3'>
                        {renderImageUpload(
                            'icon',
                            values.icon,
                            updateSetting,
                            uploadImage,
                            handleError,
                            values.icon ? '66px' : '36px',
                            values.icon ? '66px' : '160px',
                            'logo',
                            'Delete icon',
                            'Upload icon'
                        )}
                    </div>
                </div>
                <div className={`flex items-start justify-between ${values.icon && 'mt-2'}`}>
                    <div>
                        <div>Publication logo</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Appears usually in the main header of your theme</Hint>
                    </div>
                    <div>
                        {renderImageUpload(
                            'logo',
                            values.logo,
                            updateSetting,
                            uploadImage,
                            handleError,
                            '60px',
                            '160px',
                            'site-logo',
                            'Delete logo',
                            'Upload logo',
                            {imageFit: 'contain'}
                        )}
                    </div>
                </div>
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
                                }
                            })
                        }}
                        unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
                        unsplashEnabled={unsplashEnabled}
                        width='160px'
                        onDelete={() => updateSetting('cover_image', null)}
                        onUpload={createUploadHandler('cover_image', updateSetting, uploadImage, handleError)}
                    >
                        Upload cover
                    </ImageUpload>
                    {showUnsplash && unsplashConfig && unsplashEnabled && (
                        <UnsplashSelector
                            unsplashProviderConfig={unsplashConfig}
                            onClose={() => setShowUnsplash(false)}
                            onImageInsert={image => {
                                if (image.src) {
                                    updateSetting('cover_image', image.src);
                                }
                                setShowUnsplash(false);
                            }}
                        />
                    )}
                </div>
            </Form>
            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <Select
                    className={selectFontClass(selectedHeadingFont.label, true)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={customHeadingFonts}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={createFontSelectHandler(true, setHeadingFont, updateSetting, themeNameVersion)}
                />
                <Select
                    className={selectFontClass(selectedBodyFont.label, false)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView={true}
                    options={customBodyFonts}
                    selectedOption={selectedBodyFont}
                    testId='body-font-select'
                    title={'Body font'}
                    onSelect={createFontSelectHandler(false, setBodyFont, updateSetting, themeNameVersion)}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;