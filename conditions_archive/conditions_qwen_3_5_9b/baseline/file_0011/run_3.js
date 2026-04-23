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

const DEFAULT_FONT = 'Theme default';

const FONT_CLASSES: Record<string, {base: string; bold?: string; semibold?: string; normal?: string}> = {
    'Cardo': {base: 'font-cardo', bold: 'font-bold'},
    'Manrope': {base: 'font-manrope', bold: 'font-bold'},
    'Merriweather': {base: 'font-merriweather', bold: 'font-bold'},
    'Nunito': {base: 'font-nunito', semibold: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', bold: 'font-bold'},
    'Prata': {base: 'font-prata', normal: 'font-normal'},
    'Roboto': {base: 'font-roboto', bold: 'font-bold'},
    'Rufina': {base: 'font-rufina', bold: 'font-bold'},
    'Tenor Sans': {base: 'font-tenor-sans', normal: 'font-normal'},
    'Chakra Petch': {base: 'font-chakra-petch', normal: 'font-normal'},
    'Fira Mono': {base: 'font-fira-mono', bold: 'font-bold'},
    'Fira Sans': {base: 'font-fira-sans', bold: 'font-bold'},
    'IBM Plex Serif': {base: 'font-ibm-plex-serif', bold: 'font-bold'},
    'Inter': {base: 'font-inter', bold: 'font-bold'},
    'JetBrains Mono': {base: 'font-jetbrains-mono', bold: 'font-bold'},
    'Lora': {base: 'font-lora', bold: 'font-bold'},
    'Noto Sans': {base: 'font-noto-sans', bold: 'font-bold'},
    'Noto Serif': {base: 'font-noto-serif', bold: 'font-bold'},
    'Poppins': {base: 'font-poppins', bold: 'font-bold'},
    'Space Grotesk': {base: 'font-space-grotesk', bold: 'font-bold'},
    'Space Mono': {base: 'font-space-mono', bold: 'font-bold'},
};

const getFontClassName = (fontName: string, heading: boolean = true): string => {
    const fontConfig = FONT_CLASSES[fontName];
    if (!fontConfig) return '';
    
    const parts = [fontConfig.base];
    if (heading) {
        if (fontConfig.bold) parts.push(fontConfig.bold);
        else if (fontConfig.semibold) parts.push(fontConfig.semibold);
        else if (fontConfig.normal) parts.push(fontConfig.normal);
    }
    
    return parts.join(' ');
};

const capitalizeWords = (str: string): string => str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const createFontOptions = (
    fontList: typeof CUSTOM_FONTS.heading | typeof CUSTOM_FONTS.body,
    themeNameVersion: string
): (BodyFontOption | HeadingFontOption)[] => {
    return [
        {label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'},
        ...fontList.map((x) => ({
            label: x.name,
            value: x.name,
            creator: x.creator,
            className: getFontClassName(x.name, true)
        }))
    ];
};

const handleImageUpload = (
    settingKey: string,
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (error: APIError) => void
): ((file: File) => Promise<void>) => {
    return async (file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateSetting(settingKey, imageUrl);
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };
};

const handleFontSelect = (
    setFont: React.Dispatch<React.SetStateAction<{name: string, creator: string}>>,
    settingKey: string,
    updateSetting: (key: string, value: SettingValue) => void,
    fontList: typeof CUSTOM_FONTS.heading | typeof CUSTOM_FONTS.body,
    themeNameVersion: string
): ((option: {value: string, creator?: string}) => void) => {
    return (option: {value: string, creator?: string}) => {
        if (option?.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            const font = fontList.find(f => f.name === option?.value);
            setFont({name: option?.value || '', creator: font?.creator || ''});
            updateSetting(settingKey, option?.value || '');
        }
    };
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

    const [headingFont, setHeadingFont] = useState<{name: string, creator: string}>(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );
    const [bodyFont, setBodyFont] = useState<{name: string, creator: string}>(
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = createFontOptions(CUSTOM_FONTS.heading, themeNameVersion);
    const customBodyFonts = createFontOptions(CUSTOM_FONTS.body, themeNameVersion);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleHeadingFontSelect = handleFontSelect(setHeadingFont, 'heading_font', updateSetting, CUSTOM_FONTS.heading, themeNameVersion);
    const handleBodyFontSelect = handleFontSelect(setBodyFont, 'body_font', updateSetting, CUSTOM_FONTS.body, themeNameVersion);

    const handleIconUpload = handleImageUpload('icon', updateSetting, handleError);
    const handleLogoUpload = handleImageUpload('logo', updateSetting, handleError);
    const handleCoverUpload = handleImageUpload('cover_image', updateSetting, handleError);

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
                        pintura={
                            {
                                isEnabled: editor.isEnabled,
                                openEditor: async () => editor.openEditor({
                                    image: values.coverImage || '',
                                    handleSave: async (file:File) => {
                                        try {
                                            updateSetting('cover_image', getImageUrl(await uploadImage({file})));
                                        } catch (e) {
                                            handleError(e);
                                        }
                                    }
                                })
                            }
                        }
                        unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
                        unsplashEnabled={unsplashEnabled}
                        width='160px'
                        onDelete={() => updateSetting('cover_image', null)}
                        onUpload={handleCoverUpload}
                    >
                    Upload cover
                    </ImageUpload>
                    {
                        showUnsplash && unsplashConfig && unsplashEnabled && (
                            <UnsplashSelector
                                unsplashProviderConfig={unsplashConfig}
                                onClose={() => {
                                    setShowUnsplash(false);
                                }}
                                onImageInsert={(image) => {
                                    if (image.src) {
                                        updateSetting('cover_image', image.src);
                                    }
                                    setShowUnsplash(false);
                                }}
                            />
                        )
                    }
                </div>
            </Form>
            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <Select
                    className={getFontClassName(selectedHeadingFont.label, true)}
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
                    className={getFontClassName(selectedBodyFont.label, false)}
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
```