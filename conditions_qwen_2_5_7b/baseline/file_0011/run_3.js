```typescript
import React, { useState } from 'react';
import UnsplashSelector from '../../../selectors/unsplash-selector';
import clsx from 'clsx';
import usePinturaEditor from '../../../../hooks/use-pintura-editor';
import { APIError } from '@tryghost/admin-x-framework/errors';
import { CUSTOM_FONTS } from '@tryghost/custom-fonts';
import { ColorPickerField, Form, Hint, ImageUpload, Select } from '@tryghost/admin-x-design-system';
import { Icon } from '@tryghost/admin-x-design-system';
import { OptionProps, SingleValueProps, components } from 'react-select';
import { SettingValue, getSettingValues } from '@tryghost/admin-x-framework/api/settings';
import { Theme, useBrowseThemes } from '@tryghost/admin-x-framework/api/themes';
import { getImageUrl, useUploadImage } from '@tryghost/admin-x-framework/api/images';
import { useFramework } from '@tryghost/admin-x-framework';
import { useGlobalData } from '../../../providers/global-data-provider';
import { useHandleError } from '@tryghost/admin-x-framework/hooks';
import type { BodyFontName, HeadingFontName } from '@tryghost/custom-fonts';

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

const DEFAULT_FONT = 'Theme default';

const GlobalSettings: React.FC<{ values: GlobalSettingValues; updateSetting: (key: string, value: SettingValue) => void }> = ({ values, updateSetting }) => {
    const { mutateAsync: uploadImage } = useUploadImage();
    const { settings } = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState(false);
    const { unsplashConfig } = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();

    const { data: themesData } = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...';

    const [headingFont, setHeadingFont] = useState(CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || { name: DEFAULT_FONT, creator: themeNameVersion });
    const [bodyFont, setBodyFont] = useState(CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || { name: DEFAULT_FONT, creator: themeNameVersion });

    const capitalizeWords = (str: string): string => str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    const fontClassName = (fontName: string, heading: boolean = true): string => {
        let className = '';
        switch (fontName) {
            case 'Cardo': className = clsx('font-cardo', heading && 'font-bold'); break;
            case 'Manrope': className = clsx('font-manrope', heading && 'font-bold'); break;
            case 'Merriweather': className = clsx('font-merriweather', heading && 'font-bold'); break;
            case 'Nunito': className = clsx('font-nunito', heading && 'font-semibold'); break;
            case 'Old Standard TT': className = clsx('font-old-standard-tt', heading && 'font-bold'); break;
            case 'Prata': className = clsx('font-prata', heading && 'font-normal'); break;
            case 'Roboto': className = clsx('font-roboto', heading && 'font-bold'); break;
            case 'Rufina': className = clsx('font-rufina', heading && 'font-bold'); break;
            case 'Tenor Sans': className = clsx('font-tenor-sans', heading && 'font-normal'); break;
            case 'Chakra Petch': className = clsx('font-chakra-petch', heading && 'font-normal'); break;
            case 'Fira Mono': className = clsx('font-fira-mono', heading && 'font-bold'); break;
            case 'Fira Sans': className = clsx('font-fira-sans', heading && 'font-bold'); break;
            case 'IBM Plex Serif': className = clsx('font-ibm-plex-serif', heading && 'font-bold'); break;
            case 'Inter': className = clsx('font-inter', heading && 'font-bold'); break;
            case 'JetBrains Mono': className = clsx('font-jetbrains-mono', heading && 'font-bold'); break;
            case 'Lora': className = clsx('font-lora', heading && 'font-bold'); break;
            case 'Noto Sans': className = clsx('font-noto-sans', heading && 'font-bold'); break;
            case 'Noto Serif': className = clsx('font-noto-serif', heading && 'font-bold'); break;
            case 'Poppins': className = clsx('font-poppins', heading && 'font-bold'); break;
            case 'Space Grotesk': className = clsx('font-space-grotesk', heading && 'font-bold'); break;
            case 'Space Mono': className = clsx('font-space-mono', heading && 'font-bold'); break;
            default: className = clsx('font-sans font-normal'); break;
        }
        return className;
    };

    const customHeadingFonts = CUSTOM_FONTS.heading.map((x) => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: fontClassName(x.name, true),
    }));
    customHeadingFonts.unshift({ label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal' });

    const customBodyFonts = CUSTOM_FONTS.body.map((x) => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: fontClassName(x.name, false),
    }));
    customBodyFonts.unshift({ label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal' });

    const selectFont = (fontName: string, heading: boolean) => fontClassName(fontName, heading);

    const selectedHeadingFont = { label: headingFont.name, value: headingFont.name, creator: headingFont.creator };
    const selectedBodyFont = { label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator };

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
                            onUpload={async (file) => {
                                try {
                                    updateSetting('icon', getImageUrl(await uploadImage({ file })));
                                } catch (e) {
                                    const error = e as APIError;
                                    if (error.response!.status === 415) {
                                        error.message = 'Unsupported file type';
                                    }
                                    handleError(error);
                                }
                            }}
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
                            onUpload={async (file) => {
                                try {
                                    updateSetting('logo', getImageUrl(await uploadImage({ file })));
                                } catch (e) {
                                    const error = e as APIError;
                                    if (error.response!.status === 415) {
                                        error.message = 'Unsupported file type';
                                    }
                                    handleError(error);
                                }
                            }}
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
                                        updateSetting('cover_image', getImageUrl(await uploadImage({ file })));
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
                        onUpload={async (file: any) => {
                            try {
                                updateSetting('cover_image', getImageUrl(await uploadImage({ file })));
                            } catch (e) {
                                const error = e as APIError;
                                if (error.response!.status === 415) {
                                    error.message = 'Unsupported file type';
                                }
                                handleError(error);
                            }
                        }}
                    >
                        Upload cover
                    </ImageUpload>
                    {
                        showUnsplash && unsplashConfig && unsplashEnabled && (
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
                        )
                    }
                </div>
            </Form>
            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <Select
                    className={selectFont(selectedHeadingFont.label, true)}
                    components={{ Option, SingleValue }}
                    controlClasses={{ control: '!min-h-16 !pl-2', option: '!pl-2' }}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={customHeadingFonts}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={(option) => {
                        if (option?.value === DEFAULT_FONT) {
                            setHeadingFont({ name: DEFAULT_FONT, creator: themeNameVersion });
                            updateSetting('heading_font', '');
                        } else {
                            setHeadingFont({ name: option?.value || '', creator: CUSTOM_FONTS.heading.find(f => f.name === option?.value)?.creator || '' });
                            updateSetting('heading_font', option?.value || '');
                        }
                    }}
                />
                <Select
                    className={selectFont(selectedBodyFont.label, false)}
                    components={{ Option, SingleValue }}
                    controlClasses={{ control: '!min-h-16 !pl-2', option: '!pl-2' }}
                    hint={''}
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView={true}
                    options={customBodyFonts}
                    selectedOption={selectedBodyFont}
                    testId='body-font-select'
                    title={'Body font'}
                    onSelect={(option) => {
                        if (option?.value === DEFAULT_FONT) {
                            setBodyFont({ name: DEFAULT_FONT, creator: themeNameVersion });
                            updateSetting('body_font', '');
                        } else {
                            setBodyFont({ name: option?.value || '', creator: CUSTOM_FONTS.body.find(f => f.name === option?.value)?.creator || '' });
                            updateSetting('body_font', option?.value || '');
                        }
                    }}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;
```