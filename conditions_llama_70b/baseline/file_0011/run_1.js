const fontClassName = (fontName: string, heading: boolean = true) => {
    const fontClasses = {
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
        'Space Mono': 'font-space-mono',
    };

    const fontClass = fontClasses[fontName] || '';
    const weightClass = heading ? 'font-bold' : fontName === 'Nunito' ? 'font-semibold' : fontName === 'Prata' || fontName === 'Tenor Sans' || fontName === 'Chakra Petch' ? 'font-normal' : 'font-bold';

    return clsx(fontClass, weightClass);
};