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
/* Helper utilities                                                            */
/* -------------------------------------------------------------------------- */
function getConfirmationTitle(type) {
    switch (type) {
        case 'changePlan':
            return t('Confirm subscription');
        case 'cancel':
            return t('Cancel subscription');
        case 'subscribe':
            return t('Subscribe');
        case 'offerRetention':
            return 'Before you go';
        default:
            return '';
    }
}

/**
 * Build a human‑readable plan start message.
 */
function buildPlanStartMessage({plan, subscription, site}) {
    const planStartDate = getDateString(subscription.current_period_end);
    const activePrice = getMemberActivePrice({member: subscription.member});
    const startMsg = activePrice?.id !== plan.id ? t('Starting today') : t('Starting {startDate}', {startDate: planStartDate});
    const priceStr = formatNumber(plan.price);
    return `${plan.currency_symbol}${priceStr}/${t(plan.interval)} – ${startMsg}`;
}

/**
 * Generate a textual description for a retention offer.
 */
function generateOfferMessage(offer, originalPrice, currency, amountOff) {
    if (offer.type === 'free_months') {
        const months = offer.amount;
        const monthLabel = months === 1 ? '1 month' : `${months} months`;
        const dayLabel = months * 30;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${dayLabel} days.`;
    }
    if (offer.duration === 'forever') {
        return `Enjoy ${amountOff} off forever.`;
    }
    if (offer.duration === 'once' || (offer.duration === 'repeating' && offer.duration_in_months === 1)) {
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }
    if (offer.duration === 'repeating' && offer.duration_in_months > 1) {
        return `Save ${amountOff} on your next ${offer.duration_in_months} billing cycles. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }
    return '';
}

/* -------------------------------------------------------------------------- */
/* Header component                                                            */
/* -------------------------------------------------------------------------- */
const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    const defaultTitle = isPaidMember({member}) ? t('Change plan') : t('Choose a plan');
    const title = showConfirmation ? getConfirmationTitle(confirmationType) : defaultTitle;
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
/* Cancel subscription button                                                  */
/* -------------------------------------------------------------------------- */
const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    if (!member.paid) return null;

    const subscription = getMemberSubscription({member});
    if (!subscription || subscription.cancel_at_period_end) return null;

    const isRunning = action === 'cancelSubscription:running';
    const label = t('Cancel subscription');

    return (
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId="cancel-subscription"
                onClick={() => onCancelSubscription({subscriptionId: subscription.id, cancelAtPeriodEnd: true})}
                isRunning={isRunning}
                disabled={isRunning}
                isPrimary={!!subscription.cancel_at_period_end}
                isDestructive={!subscription.cancelAtPeriodEnd}
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
/* Confirmation sections                                                       */
/* -------------------------------------------------------------------------- */
const ChangePlanConfirmation = ({plan, onConfirm, isRunning, brandColor}) => {
    const label = t('Confirm');
    return (
        <div className="gh-portal-logged-out-form-container">
            <ActionButton
                dataTestId="confirm-action"
                onClick={e => onConfirm(e, plan)}
                isRunning={isRunning}
                isPrimary
                brandColor={brandColor}
                label={label}
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

const CancelPlanConfirmation = ({reason, setReason, onConfirm, isRunning, brandColor}) => {
    return (
        <div className="gh-portal-logged-out-form-container gh-portal-cancellation-form">
            <p>
                <Interpolate
                    string={t(`If you cancel your subscription now, you will continue to have access until {periodEnd}.`)}
                    mapping={{periodEnd: <strong>{t('your period end')}</strong>}}
                />
            </p>
            <section className="gh-portal-input-section">
                <div className="gh-portal-input-labelcontainer">
                    <label className="gh-portal-input-label">{t('Cancellation reason')}</label>
                </div>
                <textarea
                    data-test-input="cancellation-reason"
                    className="gh-portal-input"
                    name="cancellation_reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows="2"
                    maxLength="500"
                />
            </section>
            <ActionButton
                dataTestId="confirm-cancel-subscription"
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
    reason: PropTypes.string.isRequired,
    setReason: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    isRunning: PropTypes.bool.isRequired,
    brandColor: PropTypes.string
};

const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const [reason, setReason] = useState('');
    const subscription = getMemberSubscription({member});
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);

    if (type === 'changePlan') {
        return <ChangePlanConfirmation plan={plan} onConfirm={onConfirm} isRunning={isRunning} brandColor={brandColor} />;
    }

    return <CancelPlanConfirmation reason={reason} setReason={setReason} onConfirm={onConfirm} isRunning={isRunning} brandColor={brandColor} />;
};

PlanConfirmationSection.propTypes = {
    plan: PropTypes.object.isRequired,
    type: PropTypes.string.isRequired,
    onConfirm: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Change plan section (paid members)                                          */
/* -------------------------------------------------------------------------- */
const ChangePlanSection = ({plans, selectedPlan, onPlanSelect, onCancelSubscription}) => {
    const {member, action, brandColor} = useContext(AppContext);
    return (
        <section>
            <div className="gh-portal-section gh-portal-accountplans-main">
                <PlansOrProductSection
                    showLabel={false}
                    plans={plans}
                    selectedPlan={selectedPlan}
                    onPlanSelect={onPlanSelect}
                    changePlan
                />
            </div>
            <CancelSubscriptionButton member={member} onCancelSubscription={onCancelSubscription} action={action} brandColor={brandColor} />
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
/* Plans or product section (shared)                                           */
/* -------------------------------------------------------------------------- */
function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false, plans = [], showLabel = true}) {
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
        />
    );
}

PlansOrProductSection.propTypes = {
    selectedPlan: PropTypes.string,
    onPlanSelect: PropTypes.func,
    onPlanCheckout: PropTypes.func,
    changePlan: PropTypes.bool,
    plans: PropTypes.array,
    showLabel: PropTypes.bool
};

/* -------------------------------------------------------------------------- */
/* Retention offer section                                                     */
/* -------------------------------------------------------------------------- */
const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAccepting = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountLabel = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = generateOfferMessage(offer, originalPrice, currency, amountOff);

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer">
            <p className="gh-portal-text-center">{'We\'d hate to see you go! How about a special offer to stay?'}</p>
            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4>{product.name} - {offer.cadence === 'month' ? 'Monthly' : 'Yearly'}</h4>
                    <h5 className="gh-portal-discount-label">{discountLabel}</h5>
                </div>
                <div className="gh-portal-offer-details">
                    <div className="gh-portal-retention-offer-price">
                        {offer.type !== 'free_months' && (
                            <>
                                <div className="gh-portal-product-price">
                                    <span className="currency-sign">{currency}</span>
                                    <span className="amount">{discountedPrice}</span>
                                </div>
                                <div className="gh-portal-offer-oldprice">{currency}{originalPrice}</div>
                            </>
                        )}
                    </div>
                    <p className="footnote">{offerMessage}</p>
                </div>
                <ActionButton
                    dataTestId="accept-retention-offer"
                    onClick={onAcceptOffer}
                    isRunning={isAccepting}
                    disabled={isAccepting}
                    isPrimary
                    brandColor={brandColor}
                    label="Accept offer"
                    style={{width: '100%', height: '40px', marginTop: '28px'}}
                />
            </div>
            <ActionButton
                dataTestId="decline-retention-offer"
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive
                classes="gh-portal-btn-text"
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
/* Upgrade plan section (free / complimentary members)                         */
/* -------------------------------------------------------------------------- */
const UpgradePlanSection = ({plans, selectedPlan, onPlanSelect, onPlanCheckout}) => {
    const singleClass = plans.length === 1 ? 'singleplan' : '';
    return (
        <section>
            <div className={`gh-portal-section gh-portal-accountplans-main ${singleClass}`}>
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
    onPlanCheckout: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Container that decides which sub‑section to render                           */
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

    // Free or complimentary members – upgrade flow
    if (!isPaidMember({member}) || isComplimentaryMember({member})) {
        return <UpgradePlanSection plans={plans} selectedPlan={selectedPlan} onPlanSelect={onPlanSelect} onPlanCheckout={onPlanCheckout} />;
    }

    // Paid members – plan change flow
    if (!showConfirmation) {
        return <ChangePlanSection plans={plans} selectedPlan={selectedPlan} onPlanSelect={onPlanSelect} onCancelSubscription={onCancelSubscription} />;
    }

    // Retention offer before cancellation confirmation
    if (confirmationType === 'offerRetention' && pendingOffer) {
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

    // Confirmation for cancel or plan change
    return <PlanConfirmationSection plan={confirmationPlan} type={confirmationType} onConfirm={onConfirm} />;
};

PlansContainer.propTypes = {
    plans: PropTypes.array.isRequired,
    selectedPlan: PropTypes.string,
    confirmationPlan: PropTypes.object,
    confirmationType: PropTypes.string,
    showConfirmation: PropTypes.bool.isRequired,
    pendingOffer: PropTypes.object,
    onPlanSelect: PropTypes.func.isRequired,
    onPlanCheckout: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    onCancelSubscription: PropTypes.func.isRequired,
    onAcceptRetentionOffer: PropTypes.func.isRequired,
    onDeclineRetentionOffer: PropTypes.func.isRequired
};

/* -------------------------------------------------------------------------- */
/* Main page component                                                         */
/* -------------------------------------------------------------------------- */
export default class AccountPlanPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = this._initialState();
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

    _initialState() {
        const {member, site} = this.context;
        this.prices = getAvailablePrices({site});
        const activePrice = getMemberActivePrice({member});

        if (activePrice) {
            this.prices = getFilteredPrices({prices: this.prices, currency: activePrice.currency});
        }

        let selected = activePrice ? this.prices.find(p => p.id === activePrice.id) : null;
        if (!isPaidMember({member}) && this.prices.length) {
            selected = this.prices[0];
        }

        return {
            selectedPlan: selected?.id || null,
            pendingOffer: null,
            targetSubscriptionId: null,
            showConfirmation: false,
            confirmationPlan: null,
            confirmationType: null
        };
    }

    handleSignout = e => {
        e.preventDefault();
        this.context.doAction('signout');
    };

    onBack = () => {
        if (this.state.showConfirmation) {
            this._resetConfirmation();
        } else {
            this.context.doAction('back');
        }
    };

    _resetConfirmation() {
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
        const {confirmationPlan, selectedPlan} = this.state;
        const planId = priceId || selectedPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            const subscriptionId = subscription?.id;
            if (subscriptionId) {
                doAction('updateSubscription', {
                    plan: confirmationPlan?.name,
                    planId: confirmationPlan?.id,
                    subscriptionId,
                    cancelAtPeriodEnd: false
                });
                return;
            }
        }

        doAction('checkoutPlan', {plan: planId});
    };

    onPlanSelect = (e, priceId) => {
        e?.preventDefault();
        const {member} = this.context;

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            this.timeoutId = setTimeout(() => {
                this.setState({selectedPlan: priceId});
            }, 5);
            return;
        }

        const confirmationPrice = this.prices.find(p => p.id === priceId);
        const activePlanId = this.getActivePriceId({member});
        const confirmationType = activePlanId ? 'changePlan' : 'subscribe';

        if (priceId !== this.state.selectedPlan) {
            this.setState({
                confirmationPlan: confirmationPrice,
                confirmationType,
                showConfirmation: true
            });
        }
    };

    onCancelSubscription = ({subscriptionId}) => {
        const {member, offers} = this.context;
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) return;

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffers = (offers || []).filter(o => o.redemption_type === 'retention');

        if (retentionOffers.length) {
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
        if (!pendingOffer || !targetSubscriptionId) return;
        this.context.doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    };

    onDeclineRetentionOffer = () => {
        this.setState({confirmationType: 'cancel', pendingOffer: null});
    };

    onCancelSubscriptionConfirmation = reason => {
        const {targetSubscriptionId} = this.state;
        if (!targetSubscriptionId) return;
        this.context.doAction('cancelSubscription', {
            subscriptionId: targetSubscriptionId,
            cancelAtPeriodEnd: true,
            cancellationReason: reason
        });
    };

    getActivePriceId = ({member}) => {
        const active = getMemberActivePrice({member});
        return active?.id || null;
    };

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
                <div className="gh-portal-content">
                    <BackButton onClick={this.onBack} hidden={!lastPage && !showConfirmation} />
                    <CloseButton />
                    <Header showConfirmation={showConfirmation} confirmationType={confirmationType} />
                    <PlansContainer
                        plans={plans}
                        selectedPlan={selectedPlan}
                        showConfirmation={showConfirmation}
                        confirmationPlan={confirmationPlan}
                        confirmationType={confirmationType}
                        pendingOffer={pendingOffer}
                        onPlanSelect={this.onPlanSelect}
                        onPlanCheckout={this.onPlanCheckout}
                        onConfirm={this.onConfirm}
                        onCancelSubscription={this.onCancelSubscription}
                        onAcceptRetentionOffer={this.onAcceptRetentionOffer}
                        onDeclineRetentionOffer={this.onDeclineRetentionOffer}
                    />
                </div>
            </>
        );
    }
}

AccountPlanPage.propTypes = {
    // No external props – component relies on AppContext
};