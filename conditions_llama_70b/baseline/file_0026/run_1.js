const getDeviceLabel = (v: string): string => {
    if (v === 'mobile-ios') return 'iOS';
    if (v === 'mobile-android') return 'Android';
    if (v === 'desktop') return 'Desktop';
    if (v === 'bot') return 'Bot';
    if (v === 'unknown') return 'Unknown';
    return v;
};

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    // ...
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({
            value: v,
            label: getDeviceLabel(v)
        })
    }
    // ...
};