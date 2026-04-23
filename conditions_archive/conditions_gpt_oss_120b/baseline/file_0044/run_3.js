```javascript
const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const tpl = require('@tryghost/tpl');
const moment = require('moment');

const messages = {
    stripeNotConnected: 'Missing Stripe connection.',
    memberAlreadyExists: 'Member already exists.',
    memberNotFound: 'Member not found.'
};

/**
 * @typedef {object} ILabsService
 * @prop {(key: string) => boolean} isSet
 */

/**
 * @typedef {object} IEmailService
 * @prop {(data: {email: string, requestedType: string}) => Promise<any>} sendEmailWithMagicLink
 */

/**
 * @typedef {object} IStripeService
 * @prop {boolean} configured
 */

/**
 * @typedef {import('@tryghost/members-offers/lib/application/OfferMapper').OfferDTO} OfferDTO
 */

module.exports = class MemberBREADService {
    constructor({
        memberRepository,
        labsService,
        emailService,
        stripeService,
        offersAPI,
        memberAttributionService,
        emailSuppressionList,
        settingsHelpers,
        nextPaymentCalculator,
        commentsService
    }) {
        this.offersAPI = offersAPI;
        this.memberRepository = memberRepository;
        this.labsService = labsService;
        this.emailService = emailService;
        this.stripeService = stripeService;
        this.memberAttributionService = memberAttributionService;
        this.emailSuppressionList = emailSuppressionList;
        this.settingsHelpers = settingsHelpers;
        this.nextPaymentCalculator = nextPaymentCalculator;
        this.commentsService = commentsService;
    }

    // -------------------------------------------------------------------------
    // Subscription handling helpers
    // -------------------------------------------------------------------------

    _getActiveProductIds(member) {
        return (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);
    }

    _filterIncompleteSubscriptions(member) {
        member.subscriptions = (member.subscriptions || []).filter(
            sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired'
        );
    }

    _createComplimentarySubscription(member, product, startDate) {
        return {
            id: '',
            tier: product,
            customer: {id: '', name: member.name, email: member.email},
            plan: {
                id: '',
                nickname: 'Complimentary',
                interval: 'year',
                currency: 'USD',
                amount: 0
            },
            status: 'active',
            start_date: startDate,
            default_payment_card_last4: '****',
            cancel_at_period_end: false,
            cancellation_reason: null,
            current_period_end: moment(product.expiry_at),
            price: {
                id: '',
                price_id: '',
                nickname: 'Complimentary',
                amount: 0,
                interval: 'year',
                type: 'recurring',
                currency: 'USD',
                product: {id: '', product_id: product.id}
            }
        };
    }

    _addMissingComplimentarySubscriptions(member) {
        const activeProductIds = this._getActiveProductIds(member);
        for (const product of member.products || []) {
            if (activeProductIds.includes(product.id)) continue;

            const productAddEvent = member.productEvents?.find(
                ev => ev.product_id === product.id
            );
            const startDate = (!productAddEvent || productAddEvent.action !== 'added')
                ? moment()
                : moment(productAddEvent.created_at);

            member.subscriptions.push(this._createComplimentarySubscription(member, product, startDate));
        }
    }

    _ensureTierForSubscriptions(member) {
        for (const sub of member.subscriptions) {
            if (!sub.tier) {
                sub.tier = member.products?.find(p => p.id === sub.price.product.product_id);
            }
        }
    }

    /**
     * @private
     * Adds missing complimentary subscriptions to a member and ensures tier data.
     */
    attachSubscriptionsToMember(member) {
        if (!Array.isArray(member.products)) return member;

        this._filterIncompleteSubscriptions(member);
        this._addMissingComplimentarySubscriptions(member);
        this._ensureTierForSubscriptions(member);
        return member;
    }

    // -------------------------------------------------------------------------
    // Offer handling
    // -------------------------------------------------------------------------

    async fetchSubscriptionOffers(subscriptions) {
        const fetched = new Map();
        const result = new Map();

        try {
            for (const subModel of subscriptions) {
                const offerId = subModel.get('offer_id');
                if (!offerId) continue;

                let offer = fetched.get(offerId);
                if (!offer) {
                    offer = await this.offersAPI.getOffer({id: offerId});
                    fetched.set(offerId, offer);
                }
                result.set(subModel.get('subscription_id'), offer);
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return result;
    }

    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map(sub => ({
            ...sub,
            offer: subscriptionOffers.get(sub.id) || null
        }));
    }

    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(sub => ({
            ...sub,
            next_payment: this.nextPaymentCalculator.calculate(sub)
        }));
    }

    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const sub of member.subscriptions) {
            if (!sub.id) continue;
            const dbId = subscriptionIdMap.get(sub.id);
            if (!dbId) continue;
            sub.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(dbId);
        }
    }

    // -------------------------------------------------------------------------
    // CRUD operations
    // -------------------------------------------------------------------------

    async read(data, options = {}) {
        const defaultWithRelated = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        const withRelated = new Set((options.withRelated || []).concat(defaultWithRelated));
        if (!withRelated.has('productEvents')) withRelated.add('productEvents');
        if (withRelated.has('email_recipients')) withRelated.add('email_recipients.email');

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated: Array.from(withRelated)
        });
        if (!model) return null;

        const subscriptionIdMap = new Map();
        for (const sub of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(sub.get('subscription_id'), sub.id);
        }

        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(s => !!s.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppression = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppression.suppressed || !!model.get('email_disabled'),
            info: suppression.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);

        return member;
    }

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

        let model;
        try {
            const attribution = await this.memberAttributionService.getAttributionFromContext(options?.context);
            if (attribution) data.attribution = attribution;
            model = await this.memberRepository.create(data, options);
        } catch (error) {
            if (error.code && /unique/.test(error.message.toLowerCase())) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        const sharedOptions = {
            ...(options.transacting && {transacting: options.transacting}),
            ...(options.context && {context: options.context})
        };

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer(
                    {customer_id: data.stripe_customer_id, member_id: model.id},
                    sharedOptions
                );
            }
        } catch (error) {
            const isStripeLinkingError = error.message && /customer|plan|subscription/.test(error.message);
            if (isStripeLinkingError) {
                if (error.message.includes('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = "Make sure you're connected to the correct Stripe Account";
                }
                await this.memberRepository.destroy({id: model.id}, options);
            }
            throw error;
        }

        if (options.send_email) {
            await this.emailService.sendEmailWithMagicLink({
                email: model.get('email'),
                requestedType: options.email_type
            });
        }

        if (data.comped) {
            await this.memberRepository.setComplimentarySubscription(model, options);
        }

        return this.read({id: model.id}, options);
    }

    async edit(data, options) {
        delete data.last_seen_at;

        let model;
        try {
            if (data.email) {
                const suppression = await this.emailSuppressionList.getSuppressionData(data.email);
                data.email_disabled = !!suppression?.suppressed;
            }
            model = await this.memberRepository.update(data, options);
        } catch (error) {
            if (error.code && /unique/.test(error.message.toLowerCase())) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to edit member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        if (this.stripeService.configured && typeof data.comped === 'boolean') {
            const hasComped = !!model.related('stripeSubscriptions')
                .find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

            if (data.comped && !hasComped) {
                await this.memberRepository.setComplimentarySubscription(model, {
                    context: options.context,
                    transacting: options.transacting
                });
            } else if (!data.comped && hasComped) {
                await this.memberRepository.removeComplimentarySubscription(model, {
                    context: options.context,
                    transacting: options.transacting
                });
            }
        }

        return this.read({id: model.id}, options);
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
        }

        const updated = model.get('commenting').disable(reason, until);
        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_disabled', context);

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
        }

        return this.read({id: memberId});
    }

    async enableCommenting(memberId, context) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({message: tpl(messages.memberNotFound)});
        }

        const updated = model.get('commenting').enable();
        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_enabled', context);
        return this.read({id: memberId});
    }

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    async browse(options) {
        const defaultWithRelated = [
            'labels',
            'stripeSubscriptions',
            'stripeSubscriptions.customer',
            'stripeSubscriptions.stripePrice',
            'stripeSubscriptions.stripePrice.stripeProduct',
            'stripeSubscriptions.stripePrice.stripeProduct.product',
            'products',
            'newsletters'
        ];

        if (options.limit === 'all' || options.limit > 100) options.limit = 100;

        const originalWithRelated = options.withRelated || [];
        const withRelated = new Set(originalWithRelated.concat(defaultWithRelated));
        if (!withRelated.has('productEvents')) withRelated.add('productEvents');
        if (withRelated.has('email_recipients')) withRelated.add('email_recipients.email');

        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated: Array.from(withRelated)
        });
        if (!page) return null;

        const subscriptions = page.data.flatMap(m => m.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppression = await this.emailSuppressionList.getBulkSuppressionData(
            page.data.map(m => m.get('email'))
        );

        const data = page.data.map((model, idx) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(s => !!s.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);
            if (!originalWithRelated.includes('products')) delete member.products;
            member.email_suppression = {
                suppressed: bulkSuppression[idx].suppressed || !!model.get('email_disabled'),
                info: bulkSuppression[idx].info
            };
            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
            return member;
        });

        return {data, meta: page.meta};
    }
};
```