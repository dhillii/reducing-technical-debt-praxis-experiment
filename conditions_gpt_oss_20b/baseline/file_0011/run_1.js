import React, {useState, useCallback} from 'react';
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

const FONT_CLASS_MAP: Record<string, {base: string; headingModifier: string; bodyModifier: string}> = {
  Cardo: {base: 'font-cardo', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Manrope: {base: 'font-manrope', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Merriweather: {base: 'font-merriweather', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Nunito: {base: 'font-nunito', headingModifier: 'font-semibold', bodyModifier: 'font-normal'},
  'Old Standard TT': {base: 'font-old-standard-tt', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Prata: {base: 'font-prata', headingModifier: 'font-normal', bodyModifier: 'font-normal'},
  Roboto: {base: 'font-roboto', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Rufina: {base: 'font-rufina', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'Tenor Sans': {base: 'font-tenor-sans', headingModifier: 'font-normal', bodyModifier: 'font-normal'},
  'Chakra Petch': {base: 'font-chakra-petch', headingModifier: 'font-normal', bodyModifier: 'font-normal'},
  'Fira Mono': {base: 'font-fira-mono', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'Fira Sans': {base: 'font-fira-sans', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'IBM Plex Serif': {base: 'font-ibm-plex-serif', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Inter: {base: 'font-inter', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'JetBrains Mono': {base: 'font-jetbrains-mono', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Lora: {base: 'font-lora', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'Noto Sans': {base: 'font-noto-sans', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'Noto Serif': {base: 'font-noto-serif', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  Poppins: {base: 'font-poppins', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'Space Grotesk': {base: 'font-space-grotesk', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
  'Space Mono': {base: 'font-space-mono', headingModifier: 'font-bold', bodyModifier: 'font-normal'},
};

const getFontClass = (fontName: string, heading: boolean) => {
  if (fontName === DEFAULT_FONT) return '';
  const mapping = FONT_CLASS_MAP[fontName];
  if (!mapping) return '';
  return clsx(mapping.base, heading ? mapping.headingModifier : mapping.bodyModifier);
};

const buildFontOptions = (fonts: {name: string; creator: string}[], heading: boolean) => {
  const options = fonts.map(f => ({
    label: f.name,
    value: f.name,
    creator: f.creator,
    className: getFontClass(f.name, heading),
  }));
  options.unshift({
    label: DEFAULT_FONT,
    value: DEFAULT_FONT,
    creator: '',
    className: 'font-sans font-normal',
  });
  return options;
};

const createFontSelectHandler = (
  setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
  updateSetting: (key: string, value: SettingValue) => void,
  fontArray: {name: string; creator: string}[],
  themeNameVersion: string,
  heading: boolean
) => {
  return (option: {value?: string} | null) => {
    const value = option?.value ?? '';
    if (value === DEFAULT_FONT) {
      setFont({name: DEFAULT_FONT, creator: themeNameVersion});
      updateSetting(heading ? 'heading_font' : 'body_font', '');
    } else {
      const font = fontArray.find(f => f.name === value) ?? {name: value, creator: ''};
      setFont({name: value, creator: font.creator});
      updateSetting(heading ? 'heading_font' : 'body_font', value);
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
  const [showUnsplash, setShowUnsplash] = useState(false);
  const {unsplashConfig} = useFramework();
  const handleError = useHandleError();
  const editor = usePinturaEditor();
  const {data: themesData} = useBrowseThemes();
  const activeTheme = themesData?.themes.find((t: Theme) => t.active);
  const themeNameVersion = activeTheme
    ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
    : 'Loading...';

  const [headingFont, setHeadingFont] = useState(
    CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) ?? {name: DEFAULT_FONT, creator: themeNameVersion}
  );
  const [bodyFont, setBodyFont] = useState(
    CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) ?? {name: DEFAULT_FONT, creator: themeNameVersion}
  );

  const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true);
  const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false);

  const handleImageUpload = useCallback(
    async (file: File, key: string) => {
      try {
        const url = getImageUrl(await uploadImage({file}));
        updateSetting(key, url);
      } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) error.message = 'Unsupported file type';
        handleError(error);
      }
    },
    [uploadImage, updateSetting, handleError]
  );

  const handleIconDelete = () => updateSetting('icon', null);
  const handleLogoDelete = () => updateSetting('logo', null);
  const handleCoverDelete = () => updateSetting('cover_image', null);

  const handleUnsplashClose = () => setShowUnsplash(false);
  const handleUnsplashInsert = (image: {src?: string}) => {
    if (image.src) updateSetting('cover_image', image.src);
    setShowUnsplash(false);
  };

  const headingSelectHandler = createFontSelectHandler(
    setHeadingFont,
    updateSetting,
    CUSTOM_FONTS.heading,
    themeNameVersion,
    true
  );
  const bodySelectHandler = createFontSelectHandler(
    setBodyFont,
    updateSetting,
    CUSTOM_FONTS.body,
    themeNameVersion,
    false
  );

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
              imageURL={values.icon ?? ''}
              width={values.icon ? '66px' : '160px'}
              onDelete={handleIconDelete}
              onUpload={file => handleImageUpload(file, 'icon')}
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
              imageURL={values.logo ?? ''}
              width="160px"
              onDelete={handleLogoDelete}
              onUpload={file => handleImageUpload(file, 'logo')}
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
            imageURL={values.coverImage ?? ''}
            openUnsplash={() => setShowUnsplash(true)}
            pintura={{
              isEnabled: editor.isEnabled,
              openEditor: async () =>
                editor.openEditor({
                  image: values.coverImage ?? '',
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
            onDelete={handleCoverDelete}
            onUpload={file => handleImageUpload(file, 'cover_image')}
          >
            Upload cover
          </ImageUpload>
          {showUnsplash && unsplashConfig && unsplashEnabled && (
            <UnsplashSelector
              unsplashProviderConfig={unsplashConfig}
              onClose={handleUnsplashClose}
              onImageInsert={handleUnsplashInsert}
            />
          )}
        </div>
      </Form>
      <Form className="-mt-4" gap="sm" margins="lg" title="Typography">
        <Select
          className={getFontClass(headingFont.name, true)}
          components={{Option, SingleValue}}
          controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
          hint=""
          menuShouldScrollIntoView={true}
          options={customHeadingFonts}
          selectedOption={{label: headingFont.name, value: headingFont.name, creator: headingFont.creator}}
          testId="heading-font-select"
          title="Heading font"
          onSelect={headingSelectHandler}
        />
        <Select
          className={getFontClass(bodyFont.name, false)}
          components={{Option, SingleValue}}
          controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
          hint=""
          maxMenuHeight={200}
          menuPosition="fixed"
          menuShouldScrollIntoView={true}
          options={customBodyFonts}
          selectedOption={{label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator}}
          testId="body-font-select"
          title="Body font"
          onSelect={bodySelectHandler}
        />
      </Form>
    </>
  );
};

export default GlobalSettings;