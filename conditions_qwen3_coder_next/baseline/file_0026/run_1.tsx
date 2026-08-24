transformValue: v => {
            let label: string;
            if (v === 'mobile-ios') {
                label = 'iOS';
            } else if (v === 'mobile-android') {
                label = 'Android';
            } else if (v === 'desktop') {
                label = 'Desktop';
            } else if (v === 'bot') {
                label = 'Bot';
            } else if (v === 'unknown') {
                label = 'Unknown';
            } else {
                label = v;
            }
            return {value: v, label};
        }