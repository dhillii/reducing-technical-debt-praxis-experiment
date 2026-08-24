isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

isPublic: computed('visibility', function () {
    return this.visibility === 'public';
}),

visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
    if (this.isPublic) {
        return this.settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
    }

    const visibility = this.visibility;
    if (visibility === 'members') {
        return 'status:free,status:-free';
    }
    if (visibility === 'paid') {
        return 'status:-free';
    }
    if (visibility === 'tiers' && this.tiers) {
        return this.tiers.map((tier) => `tier:${tier.slug}`).join(',');
    }
    return visibility;
}),