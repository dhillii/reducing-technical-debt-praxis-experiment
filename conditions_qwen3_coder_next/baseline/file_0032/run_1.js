isPublic: computed('visibility', function () {
        return this.visibility === 'public';
    }),