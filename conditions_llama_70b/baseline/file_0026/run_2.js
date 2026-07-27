const getDeviceLabel = (v: string): string => {
    switch (v) {
        case 'mobile-ios':
            return 'iOS';
        case 'mobile-android':
            return 'Android';
        case 'desktop':
            return 'Desktop';
        case 'bot':
            return 'Bot';
        case 'unknown':
            return 'Unknown';
        default:
            return v;
    }
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