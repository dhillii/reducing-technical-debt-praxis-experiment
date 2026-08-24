const getFontClassName = (fontName: string, heading: boolean): string => {
    const fontMap: Record<string, {base: string; weight: string}> = {
        'Cardo': {base: 'font-cardo', weight: 'font-bold'},
        'Manrope': {base: 'font-manrope', weight: 'font-bold'},
        'Merriweather': {base: 'font-merriweather', weight: 'font-bold'},
        'Nunito': {base: 'font-nunito', weight: 'font-semibold'},
        'Old Standard TT': {base: 'font-old-standard-tt', weight: 'font-bold'},
        'Prata': {base: 'font-prata', weight: 'font-normal'},
        'Roboto': {base: 'font-roboto', weight: 'font-bold'},
        'Rufina': {base: 'font-rufina', weight: 'font-bold'},
        'Tenor Sans': {base: 'font-tenor-sans', weight: 'font-normal'},
        'Chakra Petch': {base: 'font-chakra-petch', weight: 'font-normal'},
        'Fira Mono': {base: 'font-fira-mono', weight: 'font-bold'},
        'Fira Sans': {base: 'font-fira-sans', weight: 'font-bold'},
        'IBM Plex Serif': {base: 'font-ibm-plex-serif', weight: 'font-bold'},
        'Inter': {base: 'font-inter', weight: 'font-bold'},
        'JetBrains Mono': {base: 'font-jetbrains-mono', weight: 'font-bold'},
        'Lora': {base: 'font-lora', weight: 'font-bold'},
        'Noto Sans': {base: 'font-noto-sans', weight: 'font-bold'},
        'Noto Serif': {base: 'font-noto-serif', weight: 'font-bold'},
        'Poppins': {base: 'font-poppins', weight: 'font-bold'},
        'Space Grotesk': {base: 'font-space-grotesk', weight: 'font-bold'},
        'Space Mono': {base: 'font-space-mono', weight: 'font-bold'}
    };

    const config = fontMap[fontName];
    if (!config) {
        return '';
    }

    return clsx(config.base, heading && config.weight);
};

const getFontOption = (font: {name: string; creator: string}, heading: boolean, themeNameVersion: string): FontSelectOption => {
    const className = font.name === DEFAULT_FONT
        ? 'font-sans font-normal'
        : getFontClassName(font.name, heading);

    return {
        label: font.name,
        value: font.name,
        creator: font.creator,
        className
    };
};

const getHeadingFontOptions = (themeNameVersion: string): HeadingFontOption[] => {
    const customFonts = CUSTOM_FONTS.heading.map(f => getFontOption(f, true, themeNameVersion)) as HeadingFontOption[];
    customFonts.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    return customFonts;
};

const getBodyFontOptions = (themeNameVersion: string): BodyFontOption[] => {
    const customFonts = CUSTOM_FONTS.body.map(f => getFontOption(f, false, themeNameVersion)) as BodyFontOption[];
    customFonts.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    return customFonts;
};

const getSelectedFontOption = (fontName: string, themeNameVersion: string, fontType: 'heading' | 'body'): FontSelectOption => {
    if (fontName === DEFAULT_FONT) {
        return {label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion};
    }

    const fontList = fontType === 'heading' ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;
    const foundFont = fontList.find(f => f.name === fontName);

    return {
        label: fontName,
        value: fontName,
        creator: foundFont?.creator || ''
    };
};

const selectFont = (fontName: string, heading: boolean): string => {
    if (fontName === DEFAULT_FONT) {
        return '';
    }
    return getFontClassName(fontName, heading);
};