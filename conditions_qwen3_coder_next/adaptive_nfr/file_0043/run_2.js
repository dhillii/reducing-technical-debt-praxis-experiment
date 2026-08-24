};
    }

    async getAutomatedEmailSentEvents(options = {}, filter) {
        const transformedOptions = this._configureAutomatedEmailOptions(options, filter);
        const {data: models, meta} = await this._AutomatedEmailRecipient.findPage(transformedOptions);
        const data = models.map(model => this._mapAutomatedEmailEvent(model));
        return {data, meta};
    }

    _configureAutomatedEmailOptions(options, filter) {
        return {
            ...options,
            withRelated: ['member', 'automatedEmail'],
            filter: 'custom:true',
            useBasicCount: true,
            mongoTransformer: chainTransformers(
                replaceCustomFilterTransformer(filter),
                ...mapKeys({
                    'data.created_at': 'created_at',
                    'data.member_id': 'member_id'
                })
            )
        };
    }

    _mapAutomatedEmailEvent(model) {
        const automatedEmail = model.related('automatedEmail').toJSON();
        return {
            type: 'automated_email_sent_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('created_at'),
                member: model.related('member').toJSON(),
                automatedEmail: {
                    id: automatedEmail.id,
                    slug: automatedEmail.slug
                }
            }
        };
    }