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
 * Mapping of font names to Tailwind CSS class names.
 */
const FONT_CLASS_MAP: Record<string, string> = {
    'Cardo': 'font-cardo',
    'Manrope': 'font-manrope',
    'Merriweather': 'font-merriweather',
    'Nunito': 'font-nunito',
    'Old Standard TT': 'font-old-standard-tt',
    'Prata': 'font-prata',
    'Roboto': 'font-roboto',
    'Rufina': 'font-rufina',
    'Tenor Sans': 'font-tenor-sans',
    'Chakra Petch': 'font-chakra-petch',
    'Fira Mono': 'font-fira-mono',
    'Fira Sans': 'font-fira-sans',
    'IBM Plex Serif': 'font-ibm-plex-serif',
    'Inter': 'font-inter',
    'JetBrains Mono': 'font-jetbrains-mono',
    'Lora': 'font-lora',
    'Noto Sans': 'font-noto-sans',
    'Noto Serif': 'font-noto-serif',
    'Poppins': 'font-poppins',
    'Space Grotesk': 'font-space-grotesk',
    'Space Mono': 'font-space-mono'
};

/**
 * Returns Tailwind CSS class names for a given font.
 * @param fontName - Name of the font.
 * @param heading - Whether the font is used for headings.
 */
const getFontClass = (fontName: string, heading: boolean = true): string => {
    const base = FONT_CLASS_MAP[fontName] ?? '';
    if (!base) return '';
    const weight = heading ? 'font-bold' : 'font-semibold';
    return clsx(base, weight);
};

/**
 * Builds font options for the Select component.
 * @param fonts - Array of font objects.
 * @param heading - Whether the fonts are for headings.
 * @param themeNameVersion - Creator string for default font.
 */
const buildFontOptions = (
    fonts: {name: string; creator: string}[],
    heading: boolean,
    themeNameVersion: string
): HeadingFontOption[] | BodyFontOption[] => {
    const options = fonts.map(f => ({
        label: f.name,
        value: f.name,
        creator: f.creator,
        className: getFontClass(f.name, heading)
    }));
    const defaultOption = {
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    };
    return [defaultOption, ...options];
};

/**
 * Creates an upload handler for a specific setting key.
 * @param settingKey - Key to update in settings.
 * @param updateSetting - Function to update setting.
 * @param handleError - Error handling function.
 * @param uploadImage - Image upload function.
 */
const createUploadHandler = (
    settingKey: string,
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (error: any) => void,
    uploadImage: (args: {file: File}) => Promise<any>
) => async (file: File) => {
    try {
        const url = getImageUrl(await uploadImage({file}));
        updateSetting(settingKey, url);
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

/**
 * Handles font selection for heading or body fonts.
 * @param settingKey - Setting key to update.
 * @param fontsArray - Array of font objects.
 * @param setFontState - State setter for the selected font.
 * @param updateSetting - Function to update setting.
 * @param themeNameVersion - Creator string for default font.
 */
const handleFontSelect = (
    settingKey: string,
    fontsArray: {name: string; creator: string}[],
    setFontState: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
    updateSetting: (key: string, value: SettingValue) => void,
    themeNameVersion: string
) => (option: {value?: string} | null) => {
    if (!option || option.value === DEFAULT_FONT) {
        setFontState({name: DEFAULT_FONT, creator: themeNameVersion});
        updateSetting(settingKey, '');
    } else {
        const font = fontsArray.find(f => f.name === option.value) ?? {name: option.value, creator: ''};
        setFontState({name: font.name, creator: font.creator});
        updateSetting(settingKey, option.value);
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

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion) as HeadingFontOption[];
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion) as BodyFontOption[];

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const iconUploadHandler = createUploadHandler('icon', updateSetting, handleError, uploadImage);
    const logoUploadHandler = createUploadHandler('logo', updateSetting, handleError, uploadImage);
    const coverUploadHandler = createUploadHandler('cover_image', updateSetting, handleError, uploadImage);

    const headingFontSelectHandler = handleFontSelect('heading_font', CUSTOM_FONTS.heading, setHeadingFont, updateSetting, themeNameVersion);
    const bodyFontSelectHandler = handleFontSelect('body_font', CUSTOM_FONTS.body, setBodyFont, updateSetting, themeNameVersion);

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
                            onUpload={iconUploadHandler}
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
                            onUpload={logoUploadHandler}
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
                                        const url = getImageUrl(await uploadImage({file}));
                                        updateSetting('cover_image', url);
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
                        onUpload={coverUploadHandler}
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
                    onSelect={headingFontSelectHandler}
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
                    onSelect={bodyFontSelectHandler}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;