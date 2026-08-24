/**
     * Map font names to corresponding Tailwind CSS class names.
     */
    const fontClassName = (fontName: string, heading: boolean = true) => {
        const fontClasses: Record<string, string> = {
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

        const baseClass = fontClasses[fontName];
        if (!baseClass) {
            return '';
        }

        const weightClass = heading ? 'font-bold' : getBodyWeightClass(fontName);
        return clsx(baseClass, weightClass);
    };

    /**
     * Get font weight class for body fonts based on their default styling.
     */
    const getBodyWeightClass = (fontName: string): string => {
        const weightMap: Record<string, string> = {
            'Nunito': 'font-semibold',
            'Prata': 'font-normal',
            'Tenor Sans': 'font-normal',
            'Chakra Petch': 'font-normal',
            'Fira Sans': 'font-bold',
            'IBM Plex Serif': 'font-bold',
            'Inter': 'font-bold',
            'Lora': 'font-bold',
            'Noto Sans': 'font-bold',
            'Noto Serif': 'font-bold',
            'Poppins': 'font-bold',
            'Space Grotesk': 'font-bold',
            'Space Mono': 'font-bold'
        };

        return weightMap[fontName] ?? '';
    };