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
 * Mapping of font names to Tailwind CSS class names.
 */
const FONT_CLASS_MAP: Record<string, string> = {
    Cardo: 'font-cardo',
    Manrope: 'font-manrope',
    Merriweather: 'font-merriweather',
    Nunito: 'font-nunito',
    'Old Standard TT': 'font-old-standard-tt',
    Prata: 'font-prata',
    Roboto: 'font-roboto',
    Rufina: 'font-rufina',
    'Tenor Sans': 'font-tenor-sans',
    'Chakra Petch': 'font-chakra-petch',
    'Fira Mono': 'font-fira-mono',
    'Fira Sans': 'font-fira-sans',
    'IBM Plex Serif': 'font-ibm-plex-serif',
    Inter: 'font-inter',
    'JetBrains Mono': 'font-jetbrains-mono',
    Lora: 'font-lora',
    'Noto Sans': 'font-noto-sans',
    'Noto Serif': 'font-noto-serif',
    Poppins: 'font-poppins',
    'Space Grotesk': 'font-space-grotesk',
    'Space Mono': 'font-space-mono'
};

/**
 * Returns the CSS class name for a given font and heading flag.
 */
const fontClassName = (fontName: string, heading: boolean = true): string => {
    if (fontName === DEFAULT_FONT) return '';
    const baseClass = FONT_CLASS_MAP[fontName] ?? '';
    const headingClass = heading ? 'font-bold' : 'font-normal';
    return clsx(baseClass, headingClass);
};

/**
 * Generates font options for a select component.
 */
const generateFontOptions = (
    fonts: {name: string; creator?: string}[],
    heading: boolean,
    themeNameVersion: string
): HeadingFontOption[] | BodyFontOption[] => {
    const options = fonts.map(f => ({
        label: f.name,
        value: f.name,
        creator: f.creator,
        className: fontClassName(f.name, heading)
    }));
    options.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    return options as HeadingFontOption[] | BodyFontOption[];
};

/**
 * Handles image upload for a specific setting key.
 */
const useImageUploadHandler = (
    key: string,
    updateSetting: (key: string, value: SettingValue) => void,
    uploadImage: (args: {file: File}) => Promise<string>,
    handleError: (error: unknown) => void
) => {
    return async (file: File) => {
        try {
            const url = await uploadImage({file});
            updateSetting(key, getImageUrl(url));
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
 * Icon upload component.
 */
const IconUpload: React.FC<{
    value: string | null;
    updateSetting: (key: string, value: SettingValue) => void;
    uploadImage: (args: {file: File}) => Promise<string>;
    handleError: (error: unknown) => void;
}> = ({value, updateSetting, uploadImage, handleError}) => {
    const onUpload = useImageUploadHandler('icon', updateSetting, uploadImage, handleError);
    return (
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            editButtonClassName='!top-1 !right-1'
            height={value ? '66px' : '36px'}
            id='logo'
            imageBWCheckedBg={true}
            imageURL={value || ''}
            width={value ? '66px' : '160px'}
            onDelete={() => updateSetting('icon', null)}
            onUpload={onUpload}
        >
            Upload icon
        </ImageUpload>
    );
};

/**
 * Logo upload component.
 */
const LogoUpload: React.FC<{
    value: string | null;
    updateSetting: (key: string, value: SettingValue) => void;
    uploadImage: (args: {file: File}) => Promise<string>;
    handleError: (error: unknown) => void;
}> = ({value, updateSetting, uploadImage, handleError}) => {
    const onUpload = useImageUploadHandler('logo', updateSetting, uploadImage, handleError);
    return (
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            height='60px'
            id='site-logo'
            imageBWCheckedBg={true}
            imageFit='contain'
            imageURL={value || ''}
            width='160px'
            onDelete={() => updateSetting('logo', null)}
            onUpload={onUpload}
        >
            Upload logo
        </ImageUpload>
    );
};

/**
 * Cover upload component.
 */
const CoverUpload: React.FC<{
    value: string | null;
    updateSetting: (key: string, value: SettingValue) => void;
    uploadImage: (args: {file: File}) => Promise<string>;
    handleError: (error: unknown) => void;
    editor: ReturnType<typeof usePinturaEditor>;
    unsplashEnabled: boolean;
    unsplashConfig: any;
    showUnsplash: boolean;
    setShowUnsplash: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({
    value,
    updateSetting,
    uploadImage,
    handleError,
    editor,
    unsplashEnabled,
    unsplashConfig,
    showUnsplash,
    setShowUnsplash
}) => {
    const onUpload = useImageUploadHandler('cover_image', updateSetting, uploadImage, handleError);
    const onSave = async (file: File) => {
        try {
            updateSetting('cover_image', getImageUrl(await uploadImage({file})));
        } catch (e) {
            handleError(e);
        }
    };
    return (
        <>
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                editButtonClassName='!top-1 !right-10'
                height='95px'
                id='cover'
                imageURL={value || ''}
                openUnsplash={() => setShowUnsplash(true)}
                pintura={{
                    isEnabled: editor.isEnabled,
                    openEditor: async () => editor.openEditor({
                        image: value || '',
                        handleSave: onSave
                    })
                }}
                unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
                unsplashEnabled={unsplashEnabled}
                width='160px'
                onDelete={() => updateSetting('cover_image', null)}
                onUpload={onUpload}
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
        </>
    );
};

/**
 * Font select component.
 */
const FontSelect: React.FC<{
    selectedOption: {label: string; value: string; creator: string};
    options: HeadingFontOption[] | BodyFontOption[];
    onSelect: (option: {value: string; creator?: string} | null) => void;
    className: string;
    testId: string;
    title: string;
    isHeading: boolean;
}> = ({selectedOption, options, onSelect, className, testId, title, isHeading}) => (
    <Select
        className={className}
        components={{Option, SingleValue}}
        controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
        hint={''}
        menuShouldScrollIntoView={true}
        options={options}
        selectedOption={selectedOption}
        testId={testId}
        title={title}
        onSelect={(option) => {
            if (!option) return;
            if (option.value === DEFAULT_FONT) {
                onSelect({value: DEFAULT_FONT, creator: selectedOption.creator});
            } else {
                onSelect(option);
            }
        }}
    />
);

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
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = generateFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion) as HeadingFontOption[];
    const customBodyFonts = generateFontOptions(CUSTOM_FONTS.body, false, themeNameVersion) as BodyFontOption[];

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleHeadingSelect = (option: {value: string; creator?: string} | null) => {
        if (!option) return;
        if (option.value === DEFAULT_FONT) {
            setHeadingFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting('heading_font', '');
        } else {
            setHeadingFont({name: option.value, creator: CUSTOM_FONTS.heading.find(f => f.name === option.value)?.creator || ''});
            updateSetting('heading_font', option.value);
        }
    };

    const handleBodySelect = (option: {value: string; creator?: string} | null) => {
        if (!option) return;
        if (option.value === DEFAULT_FONT) {
            setBodyFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting('body_font', '');
        } else {
            setBodyFont({name: option.value, creator: CUSTOM_FONTS.body.find(f => f.name === option.value)?.creator || ''});
            updateSetting('body_font', option.value);
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
                <div className='flex items-start justify-between'>
                    <div>
                        <div>Publication icon</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>A square, social icon, at least 60x60px</Hint>
                    </div>
                    <div className='flex gap-3'>
                        <IconUpload
                            value={values.icon}
                            updateSetting={updateSetting}
                            uploadImage={uploadImage}
                            handleError={handleError}
                        />
                    </div>
                </div>
                <div className={`flex items-start justify-between ${values.icon && 'mt-2'}`}>
                    <div>
                        <div>Publication logo</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Appears usually in the main header of your theme</Hint>
                    </div>
                    <div>
                        <LogoUpload
                            value={values.logo}
                            updateSetting={updateSetting}
                            uploadImage={uploadImage}
                            handleError={handleError}
                        />
                    </div>
                </div>
                <div className='mt-2 flex items-start justify-between' data-testid="publication-cover">
                    <div>
                        <div>Publication cover</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Usually as a large banner image on your index pages</Hint>
                    </div>
                    <CoverUpload
                        value={values.coverImage}
                        updateSetting={updateSetting}
                        uploadImage={uploadImage}
                        handleError={handleError}
                        editor={editor}
                        unsplashEnabled={unsplashEnabled}
                        unsplashConfig={unsplashConfig}
                        showUnsplash={showUnsplash}
                        setShowUnsplash={setShowUnsplash}
                    />
                </div>
            </Form>
            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <FontSelect
                    selectedOption={selectedHeadingFont}
                    options={customHeadingFonts}
                    onSelect={handleHeadingSelect}
                    className={selectFont(selectedHeadingFont.label, true)}
                    testId='heading-font-select'
                    title='Heading font'
                    isHeading={true}
                />
                <FontSelect
                    selectedOption={selectedBodyFont}
                    options={customBodyFonts}
                    onSelect={handleBodySelect}
                    className={selectFont(selectedBodyFont.label, false)}
                    testId='body-font-select'
                    title='Body font'
                    isHeading={false}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;