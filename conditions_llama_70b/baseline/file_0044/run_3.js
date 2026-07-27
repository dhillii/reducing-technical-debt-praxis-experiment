async add(data, options) {
    if (!this.stripeService.configured && (data.comped || data.stripe_customer_id)) {
        throw this.getStripeValidationError(data);
    }

    let model;

    try {
        const attribution = await this.getAttributionFromContext(options?.context);
        if (attribution) {
            data.attribution = attribution;
        }
        model = await this.memberRepository.create(data, options);
    } catch (error) {
        if (this.isUniqueError(error)) {
            throw this.getMemberAlreadyExistsError();
        }
        throw error;
    }

    const sharedOptions = this.getSharedOptions(options);

    try {
        if (data.stripe_customer_id) {
            await this.linkStripeCustomer(model, sharedOptions);
        }
    } catch (error) {
        if (this.isStripeLinkingError(error)) {
            await this.destroyMember(model, options);
            throw this.getStripeLinkingError(error);
        }
        throw error;
    }

    if (options.send_email) {
        await this.sendEmailWithMagicLink(model, options);
    }

    if (data.comped) {
        await this.setComplimentarySubscription(model, options);
    }

    return this.read({id: model.id}, options);
}

getStripeValidationError(data) {
    const property = data.comped ? 'comped' : 'stripe_customer_id';
    return new errors.ValidationError({
        message: tpl(messages.stripeNotConnected),
        context: 'Attempting to import members with Stripe data when there is no Stripe account connected.',
        help: 'You need to connect to Stripe to import Stripe customers. ',
        property
    });
}

getAttributionFromContext(context) {
    return this.memberAttributionService.getAttributionFromContext(context);
}

isUniqueError(error) {
    return error.code && error.message.toLowerCase().indexOf('unique') !== -1;
}

getMemberAlreadyExistsError() {
    return new errors.ValidationError({
        message: tpl(messages.memberAlreadyExists),
        context: 'Attempting to add member with existing email address',
        property: 'email'
    });
}

getSharedOptions(options) {
    return {
        ...(options.transacting && {transacting: options.transacting}),
        ...(options.context && {context: options.context})
    };
}

async linkStripeCustomer(model, options) {
    await this.memberRepository.linkStripeCustomer({
        customer_id: model.get('stripe_customer_id'),
        member_id: model.id
    }, options);
}

isStripeLinkingError(error) {
    return error.message && (error.message.match(/customer|plan|subscription/g));
}

async destroyMember(model, options) {
    await this.memberRepository.destroy({
        id: model.id
    }, options);
}

getStripeLinkingError(error) {
    if (error.message.indexOf('customer') && error.code === 'resource_missing') {
        error.message = `Member not imported. ${error.message}`;
        error.context = 'Missing Stripe Customer';
        error.help = 'Make sure you\'re connected to the correct Stripe Account';
    }
    return error;
}

async sendEmailWithMagicLink(model, options) {
    await this.emailService.sendEmailWithMagicLink({
        email: model.get('email'), requestedType: options.email_type
    });
}

async setComplimentarySubscription(model, options) {
    await this.memberRepository.setComplimentarySubscription(model, options);
}