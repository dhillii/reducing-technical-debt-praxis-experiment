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

function getConfirmationPageTitle({confirmationType}) {
    if (confirmationType === 'changePlan') {
        return t('Confirm subscription');
    }
    if (confirmationType === 'cancel') {
        return t('Cancel subscription');
    }
    if (confirmationType === 'subscribe') {
        return t('Subscribe');
    }
    if (confirmationType === 'offerRetention') {
        return 'Before you go';
    }
    return '';
}

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

const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    if (!member.paid) {
        return null;
    }
    const subscription = getMemberSubscription({member});
    if (!subscription || subscription.cancel_at_period_end) {
        return null;
    }

    const isRunning = action === 'cancelSubscription:running';
    const label = t('Cancel subscription');
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

function getOfferMessage(offer, originalPrice, currency, amountOff) {
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

/* Compute all derived values for the retention offer UI */
function computeRetentionOfferData({price, offer}) {
    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);
    return {originalPrice, currency, discountedPrice, discountText, offerMessage};
}

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';
    const {
        originalPrice,
        currency,
        discountedPrice,
        discountText,
        offerMessage
    } = computeRetentionOfferData({price, offer});

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer">
            <p className="gh-portal-text-center">
                {'We\'d hate to see you go! How about a special offer to stay?'}
            </p>

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
                    isPrimary={true}
                    brandColor={brandColor}
                    label="Accept offer"
                    style={{width: '100%', height: '40px', marginTop: '28px'}}
                />
            </div>

            <ActionButton
                dataTestId={'decline-retention-offer'}
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive={true}
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

function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});
    const productList = (products.length > 0 || isComplimentary || !activeProduct) ? products : [activeProduct];
    return (
        <MultipleProductsPlansSection
            products={productList}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
        />
    );
}

/* Render the confirmation UI for plan changes or cancellations */
function renderPlanConfirmation({plan, type, onConfirm, isRunning, brandColor}) {
    const label = type === 'changePlan' ? t('Confirm') : t('Confirm cancellation');
    const subscription = getMemberSubscription({member: useContext(AppContext).member});
    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member: useContext(AppContext).member});
    const planStartingMessage = currentActivePlan.id !== plan.id
        ? t('Starting today')
        : t('Starting {startDate}', {startDate: planStartDate});
    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site: useContext(AppContext).site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site: useContext(AppContext).site}) ? product?.name : t('Price');

    if (type === 'changePlan') {
        return (
            <div className='gh-portal-logged-out-form-container'>
                <div className='gh-portal-list mb6'>
                    <section>
                        <div className='gh-portal-list-detail'>
                            <h3>{t('Account')}</h3>
                            <p>{useContext(AppContext).member.email}</p>
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
                    isPrimary={true}
                    brandColor={brandColor}
                    label={label}
                    style={{width: '100%', height: '40px'}}
                />
            </div>
        );
    }

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
                    label='Cancellation reason'
                    type='text'
                    name='cancellation_reason'
                    placeholder=''
                    value={useContext(AppContext).reason || ''}
                    onChange={e => useContext(AppContext).setReason?.(e.target.value)}
                    rows="2"
                    maxLength="500"
                />
            </section>
            <ActionButton
                dataTestId={'confirm-cancel-subscription'}
                onClick={e => onConfirm(e, useContext(AppContext).reason)}
                isRunning={isRunning}
                isPrimary={true}
                brandColor={brandColor}
                label={t('Confirm cancellation')}
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
}

/* Render the appropriate section based on user state and flow */
function PlansContainer({
    plans,
    selectedPlan,
    confirmationPlan,
    confirmationType,
    showConfirmation = false,
    pendingOffer,
    onPlanSelect,
    onPlanCheckout,
    onConfirm,
    onCancelSubscription,
    onAcceptRetentionOffer,
    onDeclineRetentionOffer
}) {
    const {member, site, action, brandColor} = useContext(AppContext);
    const isPaid = isPaidMember({member});
    const isComplimentary = isComplimentaryMember({member});

    if (!isPaid || isComplimentary) {
        return (
            <UpgradePlanSection
                plans={plans}
                selectedPlan={selectedPlan}
                onPlanSelect={onPlanSelect}
                onPlanCheckout={onPlanCheckout}
            />
        );
    }

    if (!showConfirmation) {
        return (
            <ChangePlanSection
                plans={plans}
                selectedPlan={selectedPlan}
                onPlanSelect={onPlanSelect}
                onCancelSubscription={onCancelSubscription}
            />
        );
    }

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

    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);
    return renderPlanConfirmation({
        plan: confirmationPlan,
        type: confirmationType,
        onConfirm,
        isRunning,
        brandColor
    });
}

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
                    changePlan={true}
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

const UpgradePlanSection = ({
    plans,
    selectedPlan,
    onPlanSelect,
    onPlanCheckout
}) => {
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
            confirmationType: null,
            reason: ''
        };
    }

    handleSignout = e => {
        e.preventDefault();
        this.context.doAction('signout');
    };

    onBack = () => {
        if (this.state.showConfirmation) {
            this.cancelConfirmPage();
        } else {
            this.context.doAction('back');
        }
    };

    cancelConfirmPage() {
        this.setState({
            showConfirmation: false,
            confirmationPlan: null,
            confirmationType: null,
            pendingOffer: null,
            targetSubscriptionId: null,
            reason: ''
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
            const activePlanId = this.getActivePriceId({member});
            const confirmationType = activePlanId ? 'changePlan' : 'subscribe';
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

    onCancelSubscriptionConfirmation = reason => {
        const {targetSubscriptionId} = this.state;
        if (!targetSubscriptionId) {
            return;
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
        const {plans} = this;
        const {
            selectedPlan,
            showConfirmation,
            confirmationPlan,
            confirmationType,
            pendingOffer
        } = this.state;
        const {lastPage} = this.context;
        return (
            <>
                <div className='gh-portal-content'>
                    <BackButton onClick={this.onBack} hidden={!lastPage && !showConfirmation} />
                    <CloseButton />
                    <Header
                        confirmationType={confirmationType}
                        showConfirmation={showConfirmation}
                    />
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