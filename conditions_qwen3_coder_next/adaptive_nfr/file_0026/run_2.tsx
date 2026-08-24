device: {
        endpoint: 'api_top_devices',
        valueKey: 'device',
        transformValue: v => ({
            value: v,
            label: getDeviceLabel(v)
        })
    }

// Helper to map device codes to user-friendly labels
function getDeviceLabel(device: string): string {
    switch (device) {
        case 'mobile-ios': return 'iOS';
        case 'mobile-android': return 'Android';
        case 'desktop': return 'Desktop';
        case 'bot': return 'Bot';
        case 'unknown': return 'Unknown';
        default: return device;
    }
}