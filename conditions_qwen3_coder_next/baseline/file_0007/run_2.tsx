const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';

    if (['social-links', 'email-notifications'].includes(lastSegment)) {
        return lastSegment;
    }

    return 'profile';
};