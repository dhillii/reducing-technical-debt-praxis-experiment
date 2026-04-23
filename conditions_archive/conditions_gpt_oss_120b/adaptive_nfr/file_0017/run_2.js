import React, {useContext, useState} from 'react';
import PropTypes from 'prop-types';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import CloseButton from '../common/close-button';
import BackButton from '../common/back-button';
import {MultipleProductsPlansSection} from '../common/plans-section';
import {getDateString} from '../../utils/date-time';
import {
    formatNumber,
    getAvailablePrices,
    getCurrencySymbol,
    getFilteredPrices,
    getMemberActivePrice,
    getMemberActiveProduct,
    getMemberSubscription,
    getOfferOffAmount,
    getPriceFromSubscription,
    getProductFromId,
    getProductFromPrice,
    getSubscriptionFromId,
    getUpdatedOfferPrice,
    getUpgradeProducts,
    hasMultipleProductsFeature,
    isComplimentaryMember,
    isPaidMember
} from '../../utils/helpers';
import Interpolate from '@doist/react-interpolate';
import {t} from '../../utils/i18n';

/* -------------------------------------------------------------------------- */
/* Styles                                                                      */
/* -------------------------------------------------------------------------- */
export const AccountPlanPageStyles = `
    .account-plan.full-size .gh-portal-main-title {
        font-size: 3.2rem;
        margin-top: 44px;
    }

    .gh-portal-accountplans-main {
        margin-top: 24px;
        margin-bottom: 0;
    }

    .gh-portal-expire-container {
        margin: 32px 0 0;
    }

    .gh-portal-cancellation-form p {
        margin-bottom: 12px;
    }

    .gh-portal-cancellation-form .gh-portal-input-section {
        margin-bottom: 20px;
    }

    .gh-portal-cancellation-form .gh-portal-input {
        resize: none;
        width: 100%;
        height: 62px;
        padding: 6px 12px;
    }

    .gh-portal-retention-offer-price {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 20px;
    }

    .gh-portal-retention-offer-price .gh-portal-offer-oldprice {
        margin: 4px 0 0;
    }
`;

/* -------------------------------------------------------------------------- */
/* Helper Functions                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Returns the title for the confirmation page based on its type.
 * @param {Object} param0
 * @param {string} param0.confirmationType
 * @returns {string}
 */
function getConfirmationPageTitle({confirmationType}) {
    const titles = {
        changePlan: t('Confirm subscription'),
        cancel: t('Cancel subscription'),
        subscribe: t('Subscribe'),
        offerRetention: 'Before you go'
    };
    return titles[confirmationType];
}

/**
 * Strategy map for generating offer messages.
 */
const offerMessageStrategies = {
    free_months: ({offer}) => {
        const months = offer.amount;
        const monthLabel = months === 1 ? '1 month' : `${months} months`;
        const dayLabel = months * 30;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${dayLabel} days.`;
    },
    forever: ({amountOff}) => `Enjoy ${amountOff} off forever.`,
    once: ({currency, originalPrice, amountOff, cadence}) =>
        `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${cadence}.`,
    repeating_one: ({currency, originalPrice, amountOff, cadence}) =>
        `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${cadence}.`,
    repeating_many: ({currency, originalPrice, amountOff, cadence, months}) =>
        `Save ${amountOff} on your next ${months} billing cycles. Then ${currency}${originalPrice}/${cadence}.`
};

/**
 * Generates a human‑readable offer message.
 * @param {Object} offer
 * @param {string} originalPrice
 * @param {string} currency
 * @param {string|number} amountOff
 * @returns {string}
 */
function getOfferMessage(offer, originalPrice, currency, amountOff) {
    if (offer.type === 'free_months') {
        return offerMessageStrategies.free_months({offer});
    }

    if (offer.duration === 'forever') {
        return offerMessageStrategies.forever({amountOff});
    }

    if (offer.duration === 'once') {
        return offerMessageStrategies.once({
            currency,
            originalPrice,
            amountOff,
            cadence: offer.cadence
        });
    }

    if (offer.duration === 'repeating' && offer.duration_in_months === 1) {
        return offerMessageStrategies.repeating_one({
            currency,
            originalPrice,
            amountOff,
            cadence: offer.cadence
        });
    }

    if (offer.duration === 'repeating' && offer.duration_in_months > 1) {
        return offerMessageStrategies.repeating_many({
            currency,
            originalPrice,
            amountOff,
            cadence: offer.cadence,
            months: offer.duration_in_months
        });
    }

    return '';
}

/* -------------------------------------------------------------------------- */
/* Header Component                                                            */
/* -------------------------------------------------------------------------- */
const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    const title = showConfirmation
        ? getConfirmationPageTitle({confirmationType})
        : isPaidMember({member}) ? t('Change plan') : t('Choose a plan');

    return (
        <header className='gh-portal-detail-header'>
            <h3 className='gh-portal-main-title'>{title}</h3>
        </header>
    );
};

Header.propTypes = {
    showConfirmation: PropTypes.bool.isRequired,
    confirmationType: PropTypes.string
};

/* -------------------------------------------------------------------------- */
/* Cancel Subscription Button                                                  */
/* -------------------------------------------------------------------------- */
const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    if (!member.paid) {
        return null;
    }
    const subscription = getMemberSubscription({member});
    if (!subscription || subscription.cancel_at_period_end) {
        return null;
    }

    const label = t('Cancel subscription');
    const isRunning = ['cancelSubscription:running'].includes(action);
    const isPrimary = !!subscription.cancel_at_period_end;
    const isDestructive = !subscription.cancelAtPeriodEnd;

    return (
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId={'cancel-subscription'}
                onClick={() => {
                    onCancelSubscription({
                        subscriptionId: subscription.id,
                        cancelAtPeriodEnd: true
                    });
                }}
                isRunning={isRunning}
                disabled={isRunning}
                isPrimary={isPrimary}
                isDestructive={isDestructive}
                classes={hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : ''}
                brandColor={brandColor}
                label={label}
                style={{width: '100%'}}
            />
        </div>
    );
};

CancelSubscriptionButton.propTypes = {
    member: PropTypes.object.isRequired,
    onCancelSubscription: PropTypes.func.isRequired,
    action: PropTypes.string,
    brandColor: PropTypes.string
};

/* -------------------------------------------------------------------------- */
/* Confirmation Sections (Polymorphic)                                        */
/* -------------------------------------------------------------------------- */
const ChangePlanConfirmation = ({plan, onConfirm, isRunning, brandColor}) => {
    const {site, member} = useContext(AppContext);
    const subscription = getMemberSubscription({member});
    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member});
    const planStartingMessage = currentActivePlan.id !== plan.id
        ? t('Starting today')
        : t('Starting {startDate}', {startDate: planStartDate});

    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');

    return (
        <div className='gh-portal-logged-out-form-container'>
            <div className='gh-portal-list mb6'>
                <section>
                    <div className='gh-portal-list-detail'>
                        <h3>{t('Account')}</h3>
                        <p>{member.email}</p>
                    </div>
                </section>
                <section>
                    <div className='gh-portal-list-detail'>
                        <h3>{priceLabel}</h3>
                        <p>{planStartMessage}</p>
                    </div>
                </section>
            </div>
            <ActionButton
                dataTestId={'confirm-action'}
                onClick={e => onConfirm(e, plan)}
                isRunning={isRunning}
                isPrimary
                brandColor={brandColor}
                label={t('Confirm')}
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
};

ChangePlanConfirmation.propTypes = {
    plan: PropTypes.object.isRequired,
    onConfirm: PropTypes.func.isRequired,
    isRunning: PropTypes.bool.isRequired,
    brandColor: PropTypes.string
};

const CancelPlanConfirmation = ({plan, onConfirm, isRunning, brandColor}) => {
    const {member} = useContext(AppContext);
    const subscription = getMemberSubscription({member});
    const [reason, setReason] = useState('');

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-cancellation-form">
            <p>
                <Interpolate
                    string={t(`If you cancel your subscription now, you will continue to have access until {periodEnd}.`)}
                    mapping={{
                        periodEnd: <strong>{getDateString(subscription.current_period_end)}</strong>
                    }}
                />
            </p>
            <section className='gh-portal-input-section'>
                <div className='gh-portal-input-labelcontainer'>
                    <label className='gh-portal-input-label'>{t('Cancellation reason')}</label>
                </div>
                <textarea
                    data-test-input='cancellation-reason'
                    className='gh-portal-input'
                    key='cancellation_reason'
                    name='cancellation_reason'
                    rows="2"
                    maxLength="500"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                />
            </section>
            <ActionButton
                dataTestId={'confirm-cancel-subscription'}
                onClick={e => onConfirm(e, reason)}
                isRunning={isRunning}
                isPrimary
                brandColor={brandColor}
                label={t('Confirm cancellation')}
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
};

CancelPlanConfirmation.propTypes = {
    plan: PropTypes.object,
    onConfirm: PropTypes.func.isRequired,
    isRunning: PropTypes.bool.isRequired,
    brandColor: PropTypes.string
};

const confirmationRenderers = {
    changePlan: ChangePlanConfirmation,
    cancel: CancelPlanConfirmation,
    subscribe: ChangePlanConfirmation,
    offerRetention: CancelPlanConfirmation // reuse cancel UI for retention flow (handled elsewhere)
};

/* -------------------------------------------------------------------------- */
/* Plan Confirmation Section (Polymorphic)                                    */
/* -------------------------------------------------------------------------- */
const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);
    const Renderer = confirmationRenderers[type] || (() => null);
    return <Renderer plan={plan} onConfirm={onConfirm} isRunning={isRunning} brandColor={brandColor} />;
};

PlanConfirmationSection.propTypes = {
    plan: PropTypes.object.isRequired,
    type: PropTypes.oneOf(['changePlan', 'cancel', 'subscribe', 'offerRetention']).isRequired,
    onConfirm: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Change Plan Section                                                         */
/* -------------------------------------------------------------------------- */
const ChangePlanSection = ({plans, selectedPlan, onPlanSelect, onCancelSubscription}) => {
    const {member, action, brandColor} = useContext(AppContext);
    return (
        <section>
            <div className='gh-portal-section gh-portal-accountplans-main'>
                <PlansOrProductSection
                    showLabel={false}
                    plans={plans}
                    selectedPlan={selectedPlan}
                    onPlanSelect={onPlanSelect}
                    changePlan
                />
            </div>
            <CancelSubscriptionButton
                member={member}
                onCancelSubscription={onCancelSubscription}
                action={action}
                brandColor={brandColor}
            />
        </section>
    );
};

ChangePlanSection.propTypes = {
    plans: PropTypes.array.isRequired,
    selectedPlan: PropTypes.string,
    onPlanSelect: PropTypes.func.isRequired,
    onCancelSubscription: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Upgrade Plan Section (Free / Complimentary)                                */
/* -------------------------------------------------------------------------- */
const UpgradePlanSection = ({plans, selectedPlan, onPlanSelect, onPlanCheckout}) => {
    const singlePlanClass = plans.length === 1 ? 'singleplan' : '';
    return (
        <section>
            <div className={`gh-portal-section gh-portal-accountplans-main ${singlePlanClass}`}>
                <PlansOrProductSection
                    showLabel={false}
                    plans={plans}
                    selectedPlan={selectedPlan}
                    onPlanSelect={onPlanSelect}
                    onPlanCheckout={onPlanCheckout}
                />
            </div>
        </section>
    );
};

UpgradePlanSection.propTypes = {
    plans: PropTypes.array.isRequired,
    selectedPlan: PropTypes.string,
    onPlanSelect: PropTypes.func.isRequired,
    onPlanCheckout: PropTypes.func
};

/* -------------------------------------------------------------------------- */
/* Retention Offer Section                                                     */
/* -------------------------------------------------------------------------- */
const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer">
            <p className="gh-portal-text-center">{'We\'d hate to see you go! How about a special offer to stay?'}</p>

            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4>{product.name} - {offer.cadence === 'month' ? 'Monthly' : 'Yearly'}</h4>
                    <h5 className="gh-portal-discount-label">{discountText}</h5>
                </div>

                <div className="gh-portal-offer-details">
                    <div className="gh-portal-retention-offer-price">
                        {offer.type !== 'free_months' && (
                            <>
                                <div className="gh-portal-product-price">
                                    <span className="currency-sign">{currency}</span>
                                    <span className="amount">{discountedPrice}</span>
                                </div>
                                <div className="gh-portal-offer-oldprice">
                                    {currency}{originalPrice}
                                </div>
                            </>
                        )}
                    </div>
                    <p className="footnote">{offerMessage}</p>
                </div>

                <ActionButton
                    dataTestId={'accept-retention-offer'}
                    onClick={onAcceptOffer}
                    isRunning={isAcceptingOffer}
                    disabled={isAcceptingOffer}
                    isPrimary
                    brandColor={brandColor}
                    label="Accept offer"
                    style={{width: '100%', height: '40px', marginTop: '28px'}}
                />
            </div>

            <ActionButton
                dataTestId={'decline-retention-offer'}
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive
                classes={'gh-portal-btn-text'}
                brandColor={brandColor}
                label="No thanks, I want to cancel"
                style={{width: '100%', marginTop: '32px', marginBottom: '24px'}}
            />
        </div>
    );
};

RetentionOfferSection.propTypes = {
    offer: PropTypes.object.isRequired,
    product: PropTypes.object.isRequired,
    price: PropTypes.shape({
        amount: PropTypes.number.isRequired,
        currency: PropTypes.string.isRequired
    }).isRequired,
    onAcceptOffer: PropTypes.func.isRequired,
    onDeclineOffer: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Plans or Product Section                                                    */
/* -------------------------------------------------------------------------- */
function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false, showLabel = false, plans = []}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});

    const items = products.length > 0 || isComplimentary || !activeProduct ? products : [activeProduct];

    return (
        <MultipleProductsPlansSection
            products={items}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
            showLabel={showLabel}
            plans={plans}
        />
    );
}

PlansOrProductSection.propTypes = {
    selectedPlan: PropTypes.string,
    onPlanSelect: PropTypes.func,
    onPlanCheckout: PropTypes.func,
    changePlan: PropTypes.bool,
    showLabel: PropTypes.bool,
    plans: PropTypes.array
};

/* -------------------------------------------------------------------------- */
/* Plans Container (Polymorphic Flow)                                         */
/* -------------------------------------------------------------------------- */
const PlansContainer = ({
    plans,
    selectedPlan,
    confirmationPlan,
    confirmationType,
    showConfirmation,
    pendingOffer,
    onPlanSelect,
    onPlanCheckout,
    onConfirm,
    onCancelSubscription,
    onAcceptRetentionOffer,
    onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);

    // Flow selectors
    const isFreeOrComplimentary = !isPaidMember({member}) || isComplimentaryMember({member});
    const isRetentionOffer = confirmationType === 'offerRetention' && pendingOffer;
    const isChangeFlow = !showConfirmation && isPaidMember({member}) && !isComplimentaryMember({member});

    if (isFreeOrComplimentary) {
        return (
            <UpgradePlanSection
                plans={plans}
                selectedPlan={selectedPlan}
                onPlanSelect={onPlanSelect}
                onPlanCheckout={onPlanCheckout}
            />
        );
    }

    if (isChangeFlow) {
        return (
            <ChangePlanSection
                plans={plans}
                selectedPlan={selectedPlan}
                onPlanSelect={onPlanSelect}
                onCancelSubscription={onCancelSubscription}
            />
        );
    }

    if (isRetentionOffer) {
        const offerProduct = pendingOffer.tier
            ? getProductFromId({site, productId: pendingOffer.tier.id})
            : getMemberActiveProduct({member, site});
        const offerPrice = pendingOffer.cadence === 'month' ? offerProduct?.monthlyPrice : offerProduct?.yearlyPrice;

        if (offerProduct && offerPrice) {
            return (
                <RetentionOfferSection
                    offer={pendingOffer}
                    product={offerProduct}
                    price={offerPrice}
                    onAcceptOffer={onAcceptRetentionOffer}
                    onDeclineOffer={onDeclineRetentionOffer}
                />
            );
        }
    }

    // Default: plan confirmation (cancel / change / subscribe)
    return (
        <PlanConfirmationSection
            plan={confirmationPlan}
            type={confirmationType}
            onConfirm={onConfirm}
        />
    );
};

PlansContainer.propTypes = {
    plans: PropTypes.array.isRequired,
    selectedPlan: PropTypes.string,
    confirmationPlan: PropTypes.object,
    confirmationType: PropTypes.string,
    showConfirmation: PropTypes.bool,
    pendingOffer: PropTypes.object,
    onPlanSelect: PropTypes.func.isRequired,
    onPlanCheckout: PropTypes.func,
    onConfirm: PropTypes.func.isRequired,
    onCancelSubscription: PropTypes.func.isRequired,
    onAcceptRetentionOffer: PropTypes.func.isRequired,
    onDeclineRetentionOffer: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Main Page Component                                                         */
/* -------------------------------------------------------------------------- */
export default class AccountPlanPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = this.getInitialState();
    }

    componentDidMount() {
        const {member, pageData} = this.context;
        if (!member) {
            this.context.doAction('switchPage', {page: 'signin'});
            return;
        }

        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            this.onCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    getInitialState() {
        const {member, site} = this.context;
        this.prices = getAvailablePrices({site});
        const activePrice = getMemberActivePrice({member});

        if (activePrice) {
            this.prices = getFilteredPrices({prices: this.prices, currency: activePrice.currency});
        }

        let selectedPrice = activePrice
            ? this.prices.find(d => d.id === activePrice.id)
            : null;

        if (!isPaidMember({member}) && this.prices.length > 0) {
            selectedPrice = this.prices[0];
        }

        return {
            selectedPlan: selectedPrice?.id || null,
            pendingOffer: null,
            targetSubscriptionId: null,
            showConfirmation: false,
            confirmationPlan: null,
            confirmationType: null
        };
    }

    handleSignout(e) {
        e.preventDefault();
        this.context.doAction('signout');
    }

    onBack() {
        if (this.state.showConfirmation) {
            this.cancelConfirmPage();
        } else {
            this.context.doAction('back');
        }
    }

    cancelConfirmPage() {
        this.setState({
            showConfirmation: false,
            confirmationPlan: null,
            confirmationType: null,
            pendingOffer: null,
            targetSubscriptionId: null
        });
    }

    onPlanCheckout = (e, priceId) => {
        const {doAction, member} = this.context;
        let {confirmationPlan, selectedPlan} = this.state;

        if (priceId) {
            selectedPlan = priceId;
        }

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            const subscriptionId = subscription?.id || '';
            if (subscriptionId) {
                doAction('updateSubscription', {
                    plan: confirmationPlan.name,
                    planId: confirmationPlan.id,
                    subscriptionId,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: selectedPlan});
        }
    };

    onPlanSelect = (e, priceId) => {
        e?.preventDefault();
        const {member} = this.context;

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            this.timeoutId = setTimeout(() => {
                this.setState({selectedPlan: priceId});
            }, 5);
        } else {
            const confirmationPrice = this.prices.find(d => d.id === priceId);
            const activePlan = this.getActivePriceId({member});
            const confirmationType = activePlan ? 'changePlan' : 'subscribe';
            if (priceId !== this.state.selectedPlan) {
                this.setState({
                    confirmationPlan: confirmationPrice,
                    confirmationType,
                    showConfirmation: true
                });
            }
        }
    };

    onCancelSubscription = ({subscriptionId}) => {
        const {member, offers} = this.context;
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }
        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffers = (offers || []).filter(o => o.redemption_type === 'retention');

        if (retentionOffers.length > 0) {
            this.setState({
                showConfirmation: true,
                confirmationPlan: subscriptionPlan,
                confirmationType: 'offerRetention',
                pendingOffer: retentionOffers[0],
                targetSubscriptionId: subscriptionId
            });
        } else {
            this.setState({
                showConfirmation: true,
                confirmationPlan: subscriptionPlan,
                confirmationType: 'cancel',
                pendingOffer: null,
                targetSubscriptionId: subscriptionId
            });
        }
    };

    onAcceptRetentionOffer = () => {
        const {pendingOffer, targetSubscriptionId} = this.state;
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        this.context.doAction('applyOffer', {
            subscriptionId: targetSubscriptionId,
            offerId: pendingOffer.id
        });
    };

    onDeclineRetentionOffer = () => {
        this.setState({
            confirmationType: 'cancel',
            pendingOffer: null
        });
    };

    onCancelSubscriptionConfirmation = (reason) => {
        const {targetSubscriptionId} = this.state;
        if (!targetSubscriptionId) {
            return null;
        }
        this.context.doAction('cancelSubscription', {
            subscriptionId: targetSubscriptionId,
            cancelAtPeriodEnd: true,
            cancellationReason: reason
        });
    };

    getActivePriceId({member}) {
        const activePrice = getMemberActivePrice({member});
        return activePrice?.id || null;
    }

    onConfirm = (e, data) => {
        const {confirmationType} = this.state;
        if (confirmationType === 'cancel') {
            return this.onCancelSubscriptionConfirmation(data);
        }
        if (['changePlan', 'subscribe'].includes(confirmationType)) {
            return this.onPlanCheckout();
        }
    };

    render() {
        const {member, lastPage} = this.context;
        const {selectedPlan, showConfirmation, confirmationPlan, confirmationType, pendingOffer} = this.state;
        const plans = this.prices;

        return (
            <>
                <div className='gh-portal-content'>
                    <BackButton onClick={e => this.onBack(e)} hidden={!lastPage && !showConfirmation} />
                    <CloseButton />
                    <Header showConfirmation={showConfirmation} confirmationType={confirmationType} />
                    <PlansContainer
                        plans={plans}
                        selectedPlan={selectedPlan}
                        showConfirmation={showConfirmation}
                        confirmationPlan={confirmationPlan}
                        confirmationType={confirmationType}
                        pendingOffer={pendingOffer}
                        onConfirm={this.onConfirm}
                        onCancelSubscription={this.onCancelSubscription}
                        onAcceptRetentionOffer={this.onAcceptRetentionOffer}
                        onDeclineRetentionOffer={this.onDeclineRetentionOffer}
                        onPlanSelect={this.onPlanSelect}
                        onPlanCheckout={this.onPlanCheckout}
                    />
                </div>
            </>
        );
    }
}

AccountPlanPage.propTypes = {
    // No external props; component relies on context
};