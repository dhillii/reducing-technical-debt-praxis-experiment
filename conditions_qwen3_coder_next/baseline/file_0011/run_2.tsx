const fontClassMap: Record<string, {base: string, heading?: string, body?: string}> = {
    'Cardo': {base: 'font-cardo', heading: 'font-bold'},
    'Manrope': {base: 'font-manrope', heading: 'font-bold'},
    'Merriweather': {base: 'font-merriweather', heading: 'font-bold'},
    'Nunito': {base: 'font-nunito', body: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', heading: 'font-bold'},
    'Prata': {base: 'font-prata', heading: 'font-normal'},
    'Roboto': {base: 'font-roboto', heading: 'font-bold'},
    'Rufina': {base: 'font-rufina', heading: 'font-bold'},
    'Tenor Sans': {base: 'font-tenor-sans', body: 'font-normal'},
    'Chakra Petch': {base: 'font-chakra-petch', body: 'font-normal'},
    'Fira Mono': {base: 'font-fira-mono', heading: 'font-bold'},
    'Fira Sans': {base: 'font-fira-sans', heading: 'font-bold'},
    'IBM Plex Serif': {base: 'font-ibm-plex-serif', heading: 'font-bold'},
    'Inter': {base: 'font-inter', heading: 'font-bold'},
    'JetBrains Mono': {base: 'font-jetbrains-mono', heading: 'font-bold'},
    'Lora': {base: 'font-lora', heading: 'font-bold'},
    'Noto Sans': {base: 'font-noto-sans', heading: 'font-bold'},
    'Noto Serif': {base: 'font-noto-serif', heading: 'font-bold'},
    'Poppins': {base: 'font-poppins', heading: 'font-bold'},
    'Space Grotesk': {base: 'font-space-grotesk', heading: 'font-bold'},
    'Space Mono': {base: 'font-space-mono', heading: 'font-bold'}
};

const fontClassName = (fontName: string, heading: boolean = true) => {
    const fontConfig = fontClassMap[fontName];
    if (!fontConfig) {
        return '';
    }
    const weightClass = heading ? fontConfig.heading : fontConfig.body;
    return clsx(fontConfig.base, weightClass);
};