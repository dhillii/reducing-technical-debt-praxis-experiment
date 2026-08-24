device: {
            endpoint: 'api_top_devices',
            valueKey: 'device',
            transformValue: transformDeviceValue
        }
    }
};

/**
 * Transforms device value into a formatted display label
 * Maps known device identifiers to user-friendly names
 */
const transformDeviceValue = (v: string): {value: string, label: string} => {
    const label = v === 'mobile-ios' ? 'iOS' :
        v === 'mobile-android' ? 'Android' :
            v === 'desktop' ? 'Desktop' :
                v === 'bot' ? 'Bot' :
                    v === 'unknown' ? 'Unknown' : v;

    return {value: v, label};
};