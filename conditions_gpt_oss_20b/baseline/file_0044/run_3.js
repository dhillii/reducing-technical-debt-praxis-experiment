const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const tpl = require('@tryghost/tpl');
const moment = require('moment');

const messages = {
    stripeNotConnected: 'Missing Stripe connection.',
    memberAlreadyExists: 'Member already exists.',
    memberNotFound: 'Member not found.'
};

module.exports = class MemberBREADService {
    constructor({memberRepository, labsService, emailService, stripeService, offersAPI, memberAttributionService, emailSuppressionList, settingsHelpers, nextPaymentCalculator, commentsService}) {
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

    /**
     * @private
     * Adds missing complimentary subscriptions to a member and ensures each subscription has a tier.
     */
    attachSubscriptionsToMember(member) {
        if (!Array.isArray(member.products)) return member;

        const activeProductIds = (member.subscriptions || [])
            .filter(sub => this.memberRepository.isActiveSubscriptionStatus(sub.status))
            .map(sub => sub.price.product.product_id);

        member.subscriptions = (member.subscriptions || []).filter(sub => sub.status !== 'incomplete' && sub.status !== 'incomplete_expired');

        member.products.forEach(product => {
            if (!activeProductIds.includes(product.id)) {
                const event = member.productEvents.find(e => e.product_id === product.id);
                const startDate = event && event.action === 'added' ? moment(event.created_at) : moment();
                member.subscriptions.push(this._buildComplimentarySubscription(member, product, startDate));
            }
        });

        member.subscriptions.forEach(sub => {
            if (!sub.tier) {
                sub.tier = member.products.find(p => p.id === sub.price.product.product_id);
            }
        });

        return member;
    }

    /**
     * @private
     * Builds a complimentary subscription object.
     */
    _buildComplimentarySubscription(member, product, startDate) {
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

    // -------------------------------------------------------------------------

    async fetchSubscriptionOffers(subscriptions) {
        const fetchedOffers = new Map();
        const subscriptionOffers = new Map();

        try {
            for (const subscriptionModel of subscriptions) {
                const offerId = subscriptionModel.get('offer_id');
                if (!offerId) continue;

                let offer = fetchedOffers.get(offerId);
                if (!offer) {
                    offer = await this.offersAPI.getOffer({ id: offerId });
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

    attachOffersToSubscriptions(member, subscriptionOffers) {
        member.subscriptions = member.subscriptions.map(sub => {
            sub.offer = subscriptionOffers.get(sub.id) || null;
            return sub;
        });
    }

    attachNextPaymentToSubscriptions(member) {
        member.subscriptions = member.subscriptions.map(sub => {
            sub.next_payment = this.nextPaymentCalculator.calculate(sub);
            return sub;
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
        for (const subscription of model.related('stripeSubscriptions')) {
            subscriptionIdMap.set(subscription.get('subscription_id'), subscription.id);
        }

        const member = model.toJSON(options);
        member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
        this.attachSubscriptionsToMember(member);
        this.attachOffersToSubscriptions(member, await this.fetchSubscriptionOffers(model.related('stripeSubscriptions')));
        this.attachNextPaymentToSubscriptions(member);
        await this.attachAttributionsToMember(member, subscriptionIdMap);

        const suppressionData = await this.emailSuppressionList.getSuppressionData(member.email);
        member.email_suppression = {
            suppressed: suppressionData.suppressed || !!model.get('email_disabled'),
            info: suppressionData.info
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
            if (error.code && error.message.toLowerCase().indexOf('unique') !== -1) {
                throw new errors.ValidationError({
                    message: tpl(messages.memberAlreadyExists),
                    context: 'Attempting to add member with existing email address',
                    property: 'email'
                });
            }
            throw error;
        }

        const sharedOptions = {
            ...(options.transacting && { transacting: options.transacting }),
            ...(options.context && { context: options.context })
        };

        try {
            if (data.stripe_customer_id) {
                await this.memberRepository.linkStripeCustomer({
                    customer_id: data.stripe_customer_id,
                    member_id: model.id
                }, sharedOptions);
            }
        } catch (error) {
            const isStripeLinkingError = error.message && (error.message.match(/customer|plan|subscription/g));
            if (isStripeLinkingError) {
                if (error.message.indexOf('customer') && error.code === 'resource_missing') {
                    error.message = `Member not imported. ${error.message}`;
                    error.context = 'Missing Stripe Customer';
                    error.help = 'Make sure you\'re connected to the correct Stripe Account';
                }
                await this.memberRepository.destroy({ id: model.id }, options);
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

        return this.read({ id: model.id }, options);
    }

    async edit(data, options) {
        delete data.last_seen_at;

        let model;
        try {
            if (data.email) {
                const isSuppressed = (await this.emailSuppressionList.getSuppressionData(data.email))?.suppressed;
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
            const hasCompedSubscription = !!model.related('stripeSubscriptions').find(sub => sub.get('plan_nickname') === 'Complimentary' && sub.get('status') === 'active');

            if (typeof data.comped === 'boolean') {
                if (data.comped && !hasCompedSubscription) {
                    await this.memberRepository.setComplimentarySubscription(model, {
                        context: options.context,
                        transacting: options.transacting
                    });
                } else if (!data.comped && hasCompedSubscription) {
                    await this.memberRepository.removeComplimentarySubscription(model, {
                        context: options.context,
                        transacting: options.transacting
                    });
                }
            }
        }

        return this.read({ id: model.id }, options);
    }

    async disableCommenting(memberId, reason, until, hideComments, context) {
        const model = await this.memberRepository.get({ id: memberId });

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }

        const commenting = model.get('commenting');
        const updated = commenting.disable(reason, until);

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            'commenting_disabled',
            context
        );

        if (hideComments) {
            await this.commentsService.api.bulkUpdateStatus(`member_id:'${memberId}'+status:published`, 'hidden');
        }

        return this.read({ id: memberId });
    }

    async enableCommenting(memberId, context) {
        const model = await this.memberRepository.get({ id: memberId });

        if (!model) {
            throw new errors.NotFoundError({
                message: tpl(messages.memberNotFound)
            });
        }

        const commenting = model.get('commenting');
        const updated = commenting.enable();

        await this.memberRepository.saveCommenting(
            memberId,
            updated,
            'commenting_enabled',
            context
        );

        return this.read({ id: memberId });
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

        const subscriptions = page.data.flatMap(model => model.related('stripeSubscriptions').slice());
        const offerMap = await this.fetchSubscriptionOffers(subscriptions);
        const bulkSuppressionData = await this.emailSuppressionList.getBulkSuppressionData(page.data.map(member => member.get('email')));

        const data = page.data.map((model, index) => {
            const member = model.toJSON(options);
            member.subscriptions = member.subscriptions.filter(sub => !!sub.price);
            this.attachSubscriptionsToMember(member);
            this.attachOffersToSubscriptions(member, offerMap);
            this.attachNextPaymentToSubscriptions(member);
            if (!originalWithRelated.includes('products')) delete member.products;
            member.email_suppression = {
                suppressed: bulkSuppressionData[index].suppressed || !!model.get('email_disabled'),
                info: bulkSuppressionData[index].info
            };
            member.unsubscribe_url = this.settingsHelpers.createUnsubscribeUrl(member.uuid);
            return member;
        });

        return { data, meta: page.meta };
    }
};