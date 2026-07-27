isPublic: computed('visibility', function () {
    return this.visibility === 'public';
}),

visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
    if (this.isPublic) {
        return this.settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
    } else {
        if (this.visibility === 'members') {
            return 'status:free,status:-free';
        }
        if (this.visibility === 'paid') {
            return 'status:-free';
        }
        if (this.visibility === 'tiers' && this.tiers) {
            let filter = this.tiers.map((tier) => {
                return `tier:${tier.slug}`;
            }).join(',');
            return filter;
        }
        return this.visibility;
    }
}),