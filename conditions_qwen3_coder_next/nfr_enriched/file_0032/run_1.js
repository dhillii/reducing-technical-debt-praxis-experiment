isPublic: computed('visibility', function () {
    return this.visibility === 'public';
}),

visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
    if (this.isPublic) {
        return this._getVisibilitySegmentForPublic();
    } else {
        return this._getVisibilitySegmentForNonPublic();
    }
}),

_getVisibilitySegmentForPublic() {
    return this.settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
},

_getVisibilitySegmentForNonPublic() {
    let visibility = this.visibility;

    if (visibility === 'members') {
        return 'status:free,status:-free';
    }
    if (visibility === 'paid') {
        return 'status:-free';
    }
    if (visibility === 'tiers' && this.tiers) {
        let filter = this.tiers.map((tier) => {
            return `tier:${tier.slug}`;
        }).join(',');
        return filter;
    }
    return visibility;
},