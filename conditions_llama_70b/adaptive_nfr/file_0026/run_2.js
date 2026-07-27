// Helper to transform device value and get display label
const getDeviceLabel = (value: string): string => {
    const deviceLabels: Record<string, string> = {
        'mobile-ios': 'iOS',
        'mobile-android': 'Android',
        'desktop': 'Desktop',
        'bot': 'Bot',
        'unknown': 'Unknown'
    };
    return deviceLabels[value] || value;
};

// Configuration for each filter field type
interface FilterFieldDefinition {
    endpoint: string;
    valueKey: string;
    // Transform value and get display label
    transformValue?: (value: string) => {value: string; label: string};
    // Filter out invalid items from API response
    filterItem?: (item: Record<string, unknown>) => boolean;
}

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    // ...
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({value: v, label: getDeviceLabel(v)})
    }
    // ...
};