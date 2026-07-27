// Helper to transform device value and get display label
const transformDeviceValue = (value: string): { value: string; label: string } => {
    const deviceLabels: Record<string, string> = {
        'mobile-ios': 'iOS',
        'mobile-android': 'Android',
        desktop: 'Desktop',
        bot: 'Bot',
        unknown: 'Unknown'
    };

    return {
        value,
        label: deviceLabels[value] || value
    };
};

// Configuration for each filter field type
interface FilterFieldDefinition {
    endpoint: string;
    valueKey: string;
    // Transform value and get display label
    transformValue?: (value: string) => { value: string; label: string };
    // Filter out invalid items from API response
    filterItem?: (item: Record<string, unknown>) => boolean;
}

const FILTER_FIELD_DEFINITIONS: Record<string, FilterFieldDefinition> = {
    utm_source: {
        endpoint: 'api_top_utm_sources',
        valueKey: 'utm_source',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_medium: {
        endpoint: 'api_top_utm_mediums',
        valueKey: 'utm_medium',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_campaign: {
        endpoint: 'api_top_utm_campaigns',
        valueKey: 'utm_campaign',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_content: {
        endpoint: 'api_top_utm_contents',
        valueKey: 'utm_content',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    utm_term: {
        endpoint: 'api_top_utm_terms',
        valueKey: 'utm_term',
        transformValue: v => ({ value: v || '(not set)', label: v || '(not set)' })
    },
    source: {
        endpoint: 'api_top_sources',
        valueKey: 'source',
        transformValue: v => ({
            value: v || '',
            label: v || 'Direct'
        })
    },
    location: {
        endpoint: 'api_top_locations',
        valueKey: 'location',
        filterItem(item) {
            const location = String(item.location || '');
            return location !== '' && !UNKNOWN_LOCATION_VALUES.includes(location);
        },
        transformValue: v => ({ value: v, label: getCountryName(v) })
    },
    device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: transformDeviceValue
    }
};