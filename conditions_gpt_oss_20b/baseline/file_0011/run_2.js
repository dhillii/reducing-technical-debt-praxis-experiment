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

type FontOption = {
  value: string;
  label: string;
  creator?: string;
  className?: string;
};

const FONT_MAP: Record<string, {base: string; heading: string; body: string}> = {
  Cardo: {base: 'font-cardo', heading: 'font-bold', body: 'font-normal'},
  Manrope: {base: 'font-manrope', heading: 'font-bold', body: 'font-normal'},
  Merriweather: {base: 'font-merriweather', heading: 'font-bold', body: 'font-normal'},
  Nunito: {base: 'font-nunito', heading: 'font-semibold', body: 'font-normal'},
  'Old Standard TT': {base: 'font-old-standard-tt', heading: 'font-bold', body: 'font-normal'},
  Prata: {base: 'font-prata', heading: 'font-normal', body: 'font-normal'},
  Roboto: {base: 'font-roboto', heading: 'font-bold', body: 'font-normal'},
  Rufina: {base: 'font-rufina', heading: 'font-bold', body: 'font-normal'},
  'Tenor Sans': {base: 'font-tenor-sans', heading: 'font-normal', body: 'font-normal'},
  'Chakra Petch': {base: 'font-chakra-petch', heading: 'font-normal', body: 'font-normal'},
  'Fira Mono': {base: 'font-fira-mono', heading: 'font-bold', body: 'font-normal'},
  'Fira Sans': {base: 'font-fira-sans', heading: 'font-bold', body: 'font-normal'},
  'IBM Plex Serif': {base: 'font-ibm-plex-serif', heading: 'font-bold', body: 'font-normal'},
  Inter: {base: 'font-inter', heading: 'font-bold', body: 'font-normal'},
  'JetBrains Mono': {base: 'font-jetbrains-mono', heading: 'font-bold', body: 'font-normal'},
  Lora: {base: 'font-lora', heading: 'font-bold', body: 'font-normal'},
  'Noto Sans': {base: 'font-noto-sans', heading: 'font-bold', body: 'font-normal'},
  'Noto Serif': {base: 'font-noto-serif', heading: 'font-bold', body: 'font-normal'},
  Poppins: {base: 'font-poppins', heading: 'font-bold', body: 'font-normal'},
  'Space Grotesk': {base: 'font-space-grotesk', heading: 'font-bold', body: 'font-normal'},
  'Space Mono': {base: 'font-space-mono', heading: 'font-bold', body: 'font-normal'},
};

const getFontClass = (fontName: string, heading: boolean) => {
  if (fontName === DEFAULT_FONT) return '';
  const map = FONT_MAP[fontName];
  if (!map) return '';
  return clsx(map.base, heading ? map.heading : map.body);
};

const buildFontOptions = (fonts: {name: string; creator: string}[], heading: boolean, themeNameVersion: string) => {
  const options: FontOption[] = fonts.map(f => ({
    label: f.name,
    value: f.name,
    creator: f.creator,
    className: getFontClass(f.name, heading),
  }));
  options.unshift({
    label: DEFAULT_FONT,
    value: DEFAULT_FONT,
    creator: themeNameVersion,
    className: 'font-sans font-normal',
  });
  return options;
};

const SingleValue: React.FC<SingleValueProps<FontOption, false>> = ({children, ...props}) => (
  <components.SingleValue {...props}>
    <div className="group" data-testid="select-current-option" data-value={props.data.value}>
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-md bg-white text-2xl font-bold dark:bg-black">Aa</div>
        <div className="flex flex-col">
          <span className="text-md">{children}</span>
          <span className="font-sans text-xs font-normal text-grey-700 dark:text-grey-600">{props.data.creator}</span>
        </div>
      </div>
    </div>
  </components.SingleValue>
);

const Option: React.FC<OptionProps<FontOption, false>> = ({children, ...props}) => (
  <components.Option {...props}>
    <div className={props.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'} data-testid="select-option" data-value={props.data.value}>
      <div className="flex items-center gap-3">
        <div className="dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900">Aa</div>
        <div className="flex flex-col">
          <span className="text-md">{children}</span>
          <span className="font-sans text-xs font-normal text-grey-700 dark:text-grey-600">{props.data.creator}</span>
        </div>
      </div>
      {props.isSelected && <span><Icon name="check" size={14} /></span>}
    </div>
  </components.Option>
);

const capitalizeWords = (str: string) => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export interface GlobalSettingValues {
  description: string;
  accentColor: string;
  icon: string | null;
  logo: string | null;
  coverImage: string | null;
  headingFont: string;
  bodyFont: string;
}

const GlobalSettings: React.FC<{values: GlobalSettingValues; updateSetting: (key: string, value: SettingValue) => void}> = ({values, updateSetting}) => {
  const {mutateAsync: uploadImage} = useUploadImage();
  const {settings} = useGlobalData();
  const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
  const [showUnsplash, setShowUnsplash] = useState(false);
  const {unsplashConfig} = useFramework();
  const handleError = useHandleError();
  const editor = usePinturaEditor();
  const {data: themesData} = useBrowseThemes();
  const activeTheme = themesData?.themes.find((t: Theme) => t.active);
  const themeNameVersion = activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...';

  const [headingFont, setHeadingFont] = useState(CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion});
  const [bodyFont, setBodyFont] = useState(CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion});

  const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion);
  const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion);

  const handleImageUpload = (field: keyof GlobalSettingValues, getUrl: (file: File) => Promise<string>) => async (file: File) => {
    try {
      const url = await getUrl(file);
      updateSetting(field, url);
    } catch (e) {
      const error = e as APIError;
      if (error.response?.status === 415) error.message = 'Unsupported file type';
      handleError(error);
    }
  };

  const getUrl = async (file: File) => getImageUrl(await uploadImage({file}));

  const handleIconUpload = handleImageUpload('icon', getUrl);
  const handleLogoUpload = handleImageUpload('logo', getUrl);
  const handleCoverUpload = handleImageUpload('cover_image', getUrl);

  const handleUnsplashInsert = (image: {src?: string}) => {
    if (image.src) updateSetting('cover_image', image.src);
    setShowUnsplash(false);
  };

  const handleFontSelect = (setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>, key: 'heading_font' | 'body_font', fonts: {name: string; creator: string}[]) => (option: FontOption | null) => {
    if (!option) return;
    if (option.value === DEFAULT_FONT) {
      setFont({name: DEFAULT_FONT, creator: themeNameVersion});
      updateSetting(key, '');
    } else {
      const font = fonts.find(f => f.name === option.value) || {name: option.value, creator: ''};
      setFont({name: font.name, creator: font.creator});
      updateSetting(key, option.value);
    }
  };

  const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
  const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

  return (
    <>
      <Form className="mt-6" gap="sm" margins="lg" title="">
        <ColorPickerField
          debounceMs={200}
          direction="rtl"
          testId="accent-color-picker"
          title={<div>Accent color</div>}
          value={values.accentColor}
          onChange={value => updateSetting('accent_color', value)}
        />
        <div className="flex items-start justify-between">
          <div>
            <div>Publication icon</div>
            <Hint className="!mt-0 mr-5 max-w-[160px]">A square, social icon, at least 60x60px</Hint>
          </div>
          <div className="flex gap-3">
            <ImageUpload
              deleteButtonClassName="!top-1 !right-1"
              editButtonClassName="!top-1 !right-1"
              height={values.icon ? '66px' : '36px'}
              id="logo"
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
            <Hint className="!mt-0 mr-5 max-w-[160px]">Appears usually in the main header of your theme</Hint>
          </div>
          <div>
            <ImageUpload
              deleteButtonClassName="!top-1 !right-1"
              height="60px"
              id="site-logo"
              imageBWCheckedBg={true}
              imageFit="contain"
              imageURL={values.logo || ''}
              width="160px"
              onDelete={() => updateSetting('logo', null)}
              onUpload={handleLogoUpload}
            >
              Upload logo
            </ImageUpload>
          </div>
        </div>
        <div className="mt-2 flex items-start justify-between" data-testid="publication-cover">
          <div>
            <div>Publication cover</div>
            <Hint className="!mt-0 mr-5 max-w-[160px]">Usually as a large banner image on your index pages</Hint>
          </div>
          <ImageUpload
            deleteButtonClassName="!top-1 !right-1"
            editButtonClassName="!top-1 !right-10"
            height="95px"
            id="cover"
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
                },
              }),
            }}
            unsplashButtonClassName="!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50"
            unsplashEnabled={unsplashEnabled}
            width="160px"
            onDelete={() => updateSetting('cover_image', null)}
            onUpload={handleCoverUpload}
          >
            Upload cover
          </ImageUpload>
          {showUnsplash && unsplashConfig && unsplashEnabled && (
            <UnsplashSelector
              unsplashProviderConfig={unsplashConfig}
              onClose={() => setShowUnsplash(false)}
              onImageInsert={handleUnsplashInsert}
            />
          )}
        </div>
      </Form>
      <Form className="-mt-4" gap="sm" margins="lg" title="Typography">
        <Select
          className={getFontClass(selectedHeadingFont.label, true)}
          components={{Option, SingleValue}}
          controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
          hint=""
          menuShouldScrollIntoView={true}
          options={customHeadingFonts}
          selectedOption={selectedHeadingFont}
          testId="heading-font-select"
          title="Heading font"
          onSelect={handleFontSelect(setHeadingFont, 'heading_font', CUSTOM_FONTS.heading)}
        />
        <Select
          className={getFontClass(selectedBodyFont.label, false)}
          components={{Option, SingleValue}}
          controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
          hint=""
          maxMenuHeight={200}
          menuPosition="fixed"
          menuShouldScrollIntoView={true}
          options={customBodyFonts}
          selectedOption={selectedBodyFont}
          testId="body-font-select"
          title="Body font"
          onSelect={handleFontSelect(setBodyFont, 'body_font', CUSTOM_FONTS.body)}
        />
      </Form>
    </>
  );
};

export default GlobalSettings;