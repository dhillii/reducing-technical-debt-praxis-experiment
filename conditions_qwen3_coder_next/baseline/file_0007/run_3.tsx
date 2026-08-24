const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    const validTabs = ['social-links', 'email-notifications'];
    
    return validTabs.includes(lastSegment) ? lastSegment : 'profile';
};