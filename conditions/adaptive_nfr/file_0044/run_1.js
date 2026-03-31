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

const DEFAULT_WITH_RELATED = [
    'labels',
    'stripeSubscriptions',
    'stripeSubscriptions.customer',
    'stripeSubscriptions.stripePrice',
    'stripeSubscriptions.stripePrice.stripeProduct',
    'stripeSubscriptions.stripePrice.stripeProduct.product',
    'products',
    'newsletters'
];

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

class SubscriptionEnricher {
    constructor(memberRepository, offersAPI, nextPaymentCalculator, memberAttributionService) {
        this.memberRepository = memberRepository;
        this.offersAPI = offersAPI;
        this.nextPaymentCalculator = nextPaymentCalculator;
        this.memberAttributionService = memberAttributionService;
    }

    attachSubscriptionsToMember(member) {
        if (!member.products || !Array.isArray(member.products)) {
            return;
        }

        const subscriptionProducts = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        member.subscriptions = member.subscriptions.filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        for (const product of member.products) {
            if (!subscriptionProducts.includes(product.id)) {
                member.subscriptions.push(this._buildComplimentarySubscription(member, product));
            }
        }

        this._attachTiersToSubscriptions(member);
    }

    _buildComplimentarySubscription(member, product) {
        const productAddEvent = member.productEvents.find(event => event.product_id === product.id);
        const startDate = productAddEvent?.action === 'added' ? moment(productAddEvent.created_at) : moment();

        return {
            id: '',
            tier: product,
            customer: {
                id: '',
                name: member.name,
                email: member.email
            },
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
                product: {
                    id: '',
                    product_id: product.id
                }
            }
        };
    }

    _attachTiersToSubscriptions(member) {
        for (const subscription of member.subscriptions) {
            if (!subscription.tier) {
                subscription.tier = member.products.find(product => product.id === subscription.price.product.product_id);
            }
        }
    }

    async attachOffersToSubscriptions(member, subscriptions) {
        const subscriptionOffers = await this._fetchSubscriptionOffers(subscriptions);
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.offer = subscriptionOffers.get(subscription.id) || null;
            return subscription;
        });
    }

    async _fetchSubscriptionOffers(subscriptions) {
        const fetchedOffers = new Map();
        const subscriptionOffers = new Map();

        try {
            for (const subscriptionModel of subscriptions) {
                const offerId = subscriptionModel.get('offer_id');
                if (!offerId) continue;

                let offer = fetchedOffers.get(offerId);
                if (!offer) {
                    offer = await this.offersAPI.getOffer({id: offerId});
                    fetchedOffers.set(offerId, offer);
                }

                subscriptionOffers.set(subscriptionModel.get('subscription_id'), offer);
            }
        } catch (e) {
            logging.error(`Failed to load offers for subscriptions - ${subscriptions.map(s => s.id).join(', ')}.`);
            logging.error(e);
        }

        return subscriptionOffers;
    }

    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map((subscription) => {
            subscription.next_payment = this.nextPaymentCalculator.calculate(subscription);
            return subscription;
        });
    }

    async attachAttributionsToMember(member, subscriptionIdMap) {
        member.attribution = await this.memberAttributionService.getMemberCreatedAttribution(member.id);

        for (const subscription of member.subscriptions) {
            if (!subscription.id) continue;

            const id = subscriptionIdMap.get(subscription.id);
            if (!id) continue;

            subscription.attribution = await this.memberAttributionService.getSubscriptionCreatedAttribution(id);
        }
    }
}

class MemberDataEnricher {
    constructor(emailSuppressionList, settingsHelpers) {
        this.emailSuppressionList = emailSuppressionList;
        this.settingsHelpers = settingsHelpers;
    }

    async enrichMemberData(member, model) {
        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
        };
        member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
    }

    async enrichMembersDataBulk(members, models, bulkSuppressionData) {
        members.forEach((member, index) => {
            member.email_suppression = {
                suppressed: bulkSuppressionData[index].suppressed || !!models[index].get('email_disabled'),
                info: bulkSuppressionData[index].info
            };
            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
        });
    }
}

class RelatedDataBuilder {
    static buildWithRelated(options = {}) {
        const withRelated = new Set((options.withRelated || []).concat(DEFAULT_WITH_RELATED));

        if (!withRelated.has('productEvents')) {
            withRelated.add('productEvents');
        }

        if (withRelated.has('email_recipients')) {
            withRelated.add('email_recipients.email');
        }

        return Array.from(withRelated);
    }

    static buildSubscriptionIdMap(stripeSubscriptions) {
        const map = new Map();
        for (const subscription of stripeSubscriptions) {
            map.set(subscription.get('subscription_id'), subscription.id);
        }
        return map;
    }
}

class CommentingManager {
    constructor(memberRepository, commentsService) {
        this.memberRepository = memberRepository;
        this.commentsService = commentsService;
    }

    async getMemberOrThrow(memberId) {
        const model = await this.memberRepository.get({id: memberId});
        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }
        return model;
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const model = await this.getMemberOrThrow(memberId);
        const commenting = model.get('commenting');
        const updated = commenting.disable(reason, until);

        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_disabled', context);

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
        }
    }

    async enableCommenting(memberId, context) {
        const model = await this.getMemberOrThrow(memberId);
        const commenting = model.get('commenting');
        const updated = commenting.enable();

        await this.memberRepository.saveCommenting(memberId, updated, 'commenting_enabled', context);
    }
}

class StripeValidator {
    constructor(stripeService) {
        this.stripeService = stripeService;
    }

    validateStripeConfigured(data) {
        if (!this.stripeService.configured && (data.comped || data.stripe_customer_id)) {
            const property = data.comped ? 'comped' : 'stripe_customer_id';
            throw new errors.ValidationError({
                message: tpl(messages.stripeNotConnected),
                context: 'Attempting to import members with Stripe data when there is no Stripe account connected.',
                help: 'You need to connect to Stripe to import Stripe customers.',
                property
            });
        }
    }
}

class MemberBREADService {
    constructor({memberRepository, labsService, emailService, stripeService, offersAPI, memberAttributionService, emailSuppressionList, settingsHelpers, nextPaymentCalculator, commentsService}) {
        this.memberRepository = memberRepository;
        this.labsService = labsService;
        this.emailService = emailService;
        this.stripeService = stripeService;
        this.offersAPI = offersAPI;

        this.subscriptionEnricher = new SubscriptionEnricher(memberRepository, offersAPI, nextPaymentCalculator, memberAttributionService);
        this.dataEnricher = new MemberDataEnricher(emailSuppressionList, settingsHelpers);
        this.stripeValidator = new StripeValidator(stripeService);
        this.commentingManager = new CommentingManager(memberRepository, commentsService);
    }

    async read(data, options = {}) {
        const withRelated = RelatedDataBuilder.buildWithRelated(options);

        const model = await this.memberRepository.get(data, {
            ...options,
            withRelated
        });

        if (!model) {
            return null;
        }

        const subscriptionIdMap = RelatedDataBuilder.buildSubscriptionIdMap(model.related('stripeSubscriptions'));
        const member = model.toJSON(options);

        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.subscriptionEnricher.attachSubscriptionsToMember(member);
        await this.subscriptionEnricher.attachOffersToSubscriptions(member, model.related('stripeSubscriptions'));
        this.subscriptionEnricher.attachNextPaymentToSubscriptions(member);
        await this.subscriptionEnricher.attachAttributionsToMember(member, subscriptionIdMap);
        await this.dataEnricher.enrichMemberData(member, model);

        return member;
    }

    async add(data, options) {
        this.stripeValidator.validateStripeConfigured(data);

        let model;

        try {
            const attribution = await this.memberRepository.memberAttributionService?.getAttributionFromContext(options?.context);
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

        const sharedOptions = this._buildSharedOptions(options);

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, sharedOptions);
            }
        } catch (error) {
            await this._handleStripeLinkingError(error, model, options);
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
                const isSuppressed = (await this.dataEnricher.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
                data.email_disabled = !!isSuppressed;
            }

            model = await this.memberRepository.update(data, options);
        } catch (error) {
            if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to edit member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        if (this.stripeService.configured) {
            await this._handleCompedSubscriptionChange(model, data, options);
        }

        return this.read({id: model.id}, options);
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        await this.commentingManager.disableCommenting(memberId, reason, until, hideComments, context);
        return this.read({id: memberId});
    }

    async enableCommenting(memberId, context) {
        await this.commentingManager.enableCommenting(memberId, context);
        return this.read({id: memberId});
    }

    async logout(options) {
        await this.memberRepository.cycleTransientId(options);
    }

    async browse(options) {
        const withRelated = RelatedDataBuilder.buildWithRelated(options);
        const originalWithRelated = options.withRelated || [];

        if (options.limit === 'all' || options.limit > 100) {
            options.limit = 100;
        }

        options.useBasicCount = true;

        const page = await this.memberRepository.list({
            ...options,
            withRelated
        });

        if (!page) {
            return null;
        }

        const subscriptions = page.data.flatMap(model => model.related('stripeSubscriptions').slice());
        const bulkSuppressionData = await this.dataEnricher.emailSuppressionList.getBulkSuppressionData(page.data.map(member => member.get('email')));

        await this.subscriptionEnricher.attachOffersToSubscriptions({subscriptions: []}, subscriptions);

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
            this.subscriptionEnricher.attachSubscriptionsToMember(member);
            this.subscriptionEnricher