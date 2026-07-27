const fontClassNames: { [key: string]: string } = {
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

const fontClassName = (fontName: string, heading: boolean = true): string => {
    let className = fontClassNames[fontName] || '';
    if (heading) {
        if (fontName === 'Nunito') {
            className += ' font-semibold';
        } else if (fontName === 'Prata' || fontName === 'Tenor Sans' || fontName === 'Chakra Petch') {
            className += ' font-normal';
        } else {
            className += ' font-bold';
        }
    }
    return className;
};