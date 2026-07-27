async add(data, options) {
    if (!this.stripeService.configured && (data.comped || data.stripe_customer_id)) {
        const property = data.comped ? 'comped' : 'stripe_customer_id';
        throw new errors.ValidationError({
            message: tpl(messages.stripeNotConnected),
            context: 'Attempting to import members with Stripe data when there is no Stripe account connected.',
            help: 'You need to connect to Stripe to import Stripe customers. ',
            property
        });
    }

    const createMember = async () => {
        let model;
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) {
                data.attribution = attribution;
            }
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }
        return model;
    };

    const linkStripeCustomer = async (model) => {
        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, {
                    ...(options.transacting && {transacting: options.transacting}),
                    ...(options.context && {context: options.context})
                });
            }
        } catch (error) {
            const isStripeLinkingError = error.message && (error.message.match(/customer|plan|subscription/g));
            if (isStripeLinkingError) {
                if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }

                await this.memberRepository.destroy({
                    id: model.id
                }, options);
            }
            throw error;
        }
    };

    const sendEmailWithMagicLink = async (model) => {
        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'), requestedType: options.email_type
            });
        }
    };

    const setComplimentarySubscription = async (model) => {
        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }
    };

    const model = await createMember();
    await linkStripeCustomer(model);
    await sendEmailWithMagicLink(model);
    await setComplimentarySubscription(model);

    return this.read({id: model.id}, options);
}