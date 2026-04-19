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
/**
 * All custom fonts are maintained in the @tryghost/custom-fonts package.
 * If you need to change a font, you'll need to update the @tryghost/custom-fonts package.
 */
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
 * Mapping of font names to their CSS class names for heading and body contexts.
 */
const FONT_CLASS_MAP: Record<string, {heading: string, body: string}> = {
    'Cardo': {heading: 'font-cardo font-bold', body: 'font-cardo font-normal'},
    'Manrope': {heading: 'font-manrope font-bold', body: 'font-manrope font-normal'},
    'Merriweather': {heading: 'font-merriweather font-bold', body: 'font-merriweather font-normal'},
    'Nunito': {heading: 'font-nunito font-semibold', body: 'font-nunito font-normal'},
    'Old Standard TT': {heading: 'font-old-standard-tt font-bold', body: 'font-old-standard-tt font-normal'},
    'Prata': {heading: 'font-prata font-normal', body: 'font-prata font-normal'},
    'Roboto': {heading: 'font-roboto font-bold', body: 'font-roboto font-normal'},
    'Rufina': {heading: 'font-rufina font-bold', body: 'font-rufina font-normal'},
    'Tenor Sans': {heading: 'font-tenor-sans font-normal', body: 'font-tenor-sans font-normal'},
    'Chakra Petch': {heading: 'font-chakra-petch font-normal', body: 'font-chakra-petch font-normal'},
    'Fira Mono': {heading: 'font-fira-mono font-bold', body: 'font-fira-mono font-normal'},
    'Fira Sans': {heading: 'font-fira-sans font-bold', body: 'font-fira-sans font-normal'},
    'IBM Plex Serif': {heading: 'font-ibm-plex-serif font-bold', body: 'font-ibm-plex-serif font-normal'},
    'Inter': {heading: 'font-inter font-bold', body: 'font-inter font-normal'},
    'JetBrains Mono': {heading: 'font-jetbrains-mono font-bold', body: 'font-jetbrains-mono font-normal'},
    'Lora': {heading: 'font-lora font-bold', body: 'font-lora font-normal'},
    'Noto Sans': {heading: 'font-noto-sans font-bold', body: 'font-noto-sans font-normal'},
    'Noto Serif': {heading: 'font-noto-serif font-bold', body: 'font-noto-serif font-normal'},
    'Poppins': {heading: 'font-poppins font-bold', body: 'font-poppins font-normal'},
    'Space Grotesk': {heading: 'font-space-grotesk font-bold', body: 'font-space-grotesk font-normal'},
    'Space Mono': {heading: 'font-space-mono font-bold', body: 'font-space-mono font-normal'},
};

/**
 * Returns the CSS class name for a given font and context.
 * @param fontName - The name of the font.
 * @param heading - Whether the font is used for a heading.
 * @returns The CSS class string or an empty string for the default font.
 */
const getFontClass = (fontName: string, heading: boolean): string => {
    if (fontName === DEFAULT_FONT) return '';
    const mapping = FONT_CLASS_MAP[fontName];
    if (!mapping) return '';
    return heading ? mapping.heading : mapping.body;
};

/**
 * Builds an array of font options for a select component.
 * @param fonts - Array of font objects from CUSTOM_FONTS.
 * @param isHeading - Whether the options are for headings.
 * @returns Array of options with label, value, creator, and className.
 */
const buildFontOptions = (fonts: {name: string; creator: string}[], isHeading: boolean): HeadingFontOption[] => {
    return fonts.map((x) => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: getFontClass(x.name, isHeading),
    }));
};

/**
 * Creates a handler for selecting a font from the dropdown.
 * @param setFont - State setter for the selected font.
 * @param updateSetting - Function to update the setting.
 * @param fontArray - Array of available fonts.
 * @param key - Setting key to update.
 * @param themeNameVersion - Current theme name/version string.
 * @returns Event handler for font selection.
 */
const createFontSelectHandler = (
    setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
    updateSetting: (key: string, value: SettingValue) => void,
    fontArray: {name: string; creator: string}[],
    key: string,
    themeNameVersion: string
) => {
    return (option: {value?: string} | null) => {
        if (!option || option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(key, '');
        } else {
            const font = fontArray.find(f => f.name === option.value);
            setFont({name: option.value || '', creator: font?.creator || ''});
            updateSetting(key, option.value || '');
        }
    };
};

/**
 * Creates an upload handler for image fields.
 * @param key - Setting key to update.
 * @returns Async function handling file upload.
 */
const createUploadHandler = (key: string) => async (file: File) => {
    try {
        updateSetting(key, getImageUrl(await uploadImage({file})));
    } catch (e) {
        const error = e as APIError;
        if (error.response!.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
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

    const customHeadingFonts: HeadingFontOption[] = buildFontOptions(CUSTOM_FONTS.heading, true);
    customHeadingFonts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'});

    const customBodyFonts: BodyFontOption[] = buildFontOptions(CUSTOM_FONTS.body, false);
    customBodyFonts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'});

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleIconUpload = createUploadHandler('icon');
    const handleLogoUpload = createUploadHandler('logo');
    const handleCoverUpload = createUploadHandler('cover_image');

    const handleHeadingFontSelect = createFontSelectHandler(setHeadingFont, updateSetting, CUSTOM_FONTS.heading, 'heading_font', themeNameVersion);
    const handleBodyFontSelect = createFontSelectHandler(setBodyFont, updateSetting, CUSTOM_FONTS.body, 'body_font', themeNameVersion);

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
                        <ImageUpload
                            deleteButtonClassName='!top-1 !right-1'
                            editButtonClassName='!top-1 !right-1'
                            height={values.icon ? '66px' : '36px'}
                            id='logo'
                            imageBWCheckedBg={true}
                            imageURL={values.icon || ''}
                            width={values.icon ? '66px' : '160px'}
                            onDelete={() => updateSetting('icon', null)}
                            onUpload={handleIconUpload}
                        >
                            Upload icon
                        </ImageUpload>
                    </div>
                </div>
                <div className={`flex items-start justify-between ${values.icon && 'mt-2'}`}>
                    <div>
                        <div>Publication logo</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Appears usually in the main header of your theme</Hint>
                    </div>
                    <div>
                        <ImageUpload
                            deleteButtonClassName='!top-1 !right-1'
                            height='60px'
                            id='site-logo'
                            imageBWCheckedBg={true}
                            imageFit='contain'
                            imageURL={values.logo || ''}
                            width='160px'
                            onDelete={() => updateSetting('logo', null)}
                            onUpload={handleLogoUpload}
                        >
                            Upload logo
                        </ImageUpload>
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
                        onUpload={handleCoverUpload}
                    >
                        Upload cover
                    </ImageUpload>
                    {showUnsplash && unsplashConfig && unsplashEnabled && (
                        <UnsplashSelector
                            unsplashProviderConfig={unsplashConfig}
                            onClose={() => setShowUnsplash(false)}
                            onImageInsert={(image) => {
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
                    className={getFontClass(selectedHeadingFont.label, true)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={customHeadingFonts}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={handleHeadingFontSelect}
                />
                <Select
                    className={getFontClass(selectedBodyFont.label, false)}
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
                    onSelect={handleBodyFontSelect}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;