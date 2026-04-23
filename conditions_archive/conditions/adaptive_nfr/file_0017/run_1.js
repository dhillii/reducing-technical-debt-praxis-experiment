```javascript
import React, {useContext, useState} from 'react';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import CloseButton from '../common/close-button';
import BackButton from '../common/back-button';
import {MultipleProductsPlansSection} from '../common/plans-section';
import {getDateString} from '../../utils/date-time';
import {formatNumber, getAvailablePrices, getCurrencySymbol, getFilteredPrices, getMemberActivePrice, getMemberActiveProduct, getMemberSubscription, getOfferOffAmount, getPriceFromSubscription, getProductFromId, getProductFromPrice, getSubscriptionFromId, getUpdatedOfferPrice, getUpgradeProducts, hasMultipleProductsFeature, isComplimentaryMember, isPaidMember} from '../../utils/helpers';
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

/**
 * Maps confirmation types to their display titles
 */
const confirmationTitleMap = {
    changePlan: () => t('Confirm subscription'),
    cancel: () => t('Cancel subscription'),
    subscribe: () => t('Subscribe'),
    offerRetention: () => 'Before you go'
};

/**
 * Gets the confirmation page title based on type
 * @param {string} confirmationType - The type of confirmation
 * @returns {string} The title text
 */
function getConfirmationPageTitle({confirmationType}) {
    const titleGetter = confirmationTitleMap[confirmationType];
    return titleGetter ? titleGetter() : '';
}

const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    let title = isPaidMember({member}) ? t('Change plan') : t('Choose a plan');
    if (showConfirmation) {
        title = getConfirmationPageTitle({confirmationType});
    }
    return (
        <header className='gh-portal-detail-header'>
            <h3 className='gh-portal-main-title'>{title}</h3>
        </header>
    );
};

/**
 * Determines if cancel subscription button should be visible
 * @param {Object} member - The member object
 * @returns {boolean} Whether button should be shown
 */
function shouldShowCancelButton(member) {
    if (!member.paid) {
        return false;
    }
    const subscription = getMemberSubscription({member});
    if (!subscription) {
        return false;
    }
    return !subscription.cancel_at_period_end;
}

const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    
    if (!shouldShowCancelButton(member)) {
        return null;
    }

    const subscription = getMemberSubscription({member});
    const label = t('Cancel subscription');
    const isRunning = ['cancelSubscription:running'].includes(action);
    const disabled = isRunning;
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
                disabled={disabled}
                isPrimary={isPrimary}
                isDestructive={isDestructive}
                classes={hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : ''}
                brandColor={brandColor}
                label={label}
                style={{
                    width: '100%'
                }}
            />
        </div>
    );
};

/**
 * Renders confirmation content based on type
 */
const confirmationRenderers = {
    changePlan: ({plan, member, subscription, currentActivePlan, site, brandColor, action, onConfirm}) => {
        const priceString = formatNumber(plan.price);
        const planStartDate = getDateString(subscription.current_period_end);
        const planStartingMessage = currentActivePlan.id !== plan.id 
            ? t('Starting today')
            : t('Starting {startDate}', {startDate: planStartDate});
        const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
        const product = getProductFromPrice({site, priceId: plan?.id});
        const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');
        const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);
        const label = t('Confirm');

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
                    isPrimary={true}
                    brandColor={brandColor}
                    label={label}
                    style={{
                        width: '100%',
                        height: '40px'
                    }}
                />
            </div>
        );
    },
    cancel: ({subscription, brandColor, action, onConfirm}) => {
        const [reason, setReason] = useState('');
        const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);

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
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows="2"
                        maxLength="500"
                    />
                </section>
                <ActionButton
                    dataTestId={'confirm-cancel-subscription'}
                    onClick={e => onConfirm(e, reason)}
                    isRunning={isRunning}
                    isPrimary={true}
                    brandColor={brandColor}
                    label={t('Confirm cancellation')}
                    style={{
                        width: '100%',
                        height: '40px'
                    }}
                />
            </div>
        );
    }
};

// For confirmation flows
const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const subscription = getMemberSubscription({member});
    const currentActivePlan = getMemberActivePrice({member});

    const renderer = confirmationRenderers[type];
    if (!renderer) {
        return null;
    }

    return renderer({
        plan,
        member,
        subscription,
        currentActivePlan,
        site,
        brandColor,
        action,
        onConfirm
    });
};

// For paid members
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
            <CancelSubscriptionButton {...{member, onCancelSubscription, action, brandColor}} />
        </section>
    );
};

function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});
    return (
        <MultipleProductsPlansSection
            products={products.length > 0 || isComplimentary || !activeProduct ? products : [activeProduct]}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
        />
    );
}

/**
 * Offer message strategy map for different offer types and durations
 */
const offerMessageStrategies = {
    free_months: (offer) => {
        const months = offer.amount;
        const monthLabel = months === 1 ? '1 month' : `${months} months`;
        const dayLabel = months * 30;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${dayLabel} days.`;
    },
    forever: (offer, originalPrice, currency) => {
        const amountOff = getOfferOffAmount({offer});
        return `Enjoy ${amountOff} off forever.`;
    },
    once: (offer, originalPrice, currency) => {
        const amountOff = getOfferOffAmount({offer});
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    },
    repeating_single: (offer, originalPrice, currency) => {
        const amountOff = getOfferOffAmount({offer});
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    },
    repeating_multiple: (offer, originalPrice, currency) => {
        const amountOff = getOfferOffAmount({offer});
        return `Save ${amountOff} on your next ${offer.duration_in_months} billing cycles. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }
};

/**
 * Determines the strategy key for offer message generation
 * @param {Object} offer - The offer object
 * @returns {string} The strategy key
 */
function getOfferMessageStrategyKey(offer) {
    if (offer.type === 'free_months') {
        return 'free_months';
    }
    if (offer.duration === 'forever') {
        return 'forever';
    }
    if (offer.duration === 'once') {
        return 'once';
    }
    if (offer.duration === 'repeating' && offer.duration_in_months === 1) {
        return 'repeating_single';
    }
    if (offer.duration === 'repeating' && offer.duration_in_months > 1) {
        return 'repeating_multiple';
    }
    return null;
}

/**
 * Generates offer message based on offer type and duration
 * @param {Object} offer - The offer object
 * @param {string} originalPrice - The original price
 * @param {string} currency - The currency symbol
 * @param {string} amountOff - The discount amount
 * @returns {string} The offer message
 */
function getOfferMessage(offer, originalPrice, currency, amountOff) {
    const strategyKey = getOfferMessageStrategyKey(offer);
    const strategy = offerMessageStrategies[strategyKey];
    
    if (!strategy) {
        return '';
    }
    
    return strategy(offer, originalPrice, currency, amountOff);
}

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;

    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);

    // TODO: Add i18n once copy is finalized
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
                        {!(offer.type === 'free_months') && (
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
                    <p className="footnote">
                        {offerMessage}
                    </p>
                </div>

                <ActionButton
                    dataTestId={'accept-retention-offer'}
                    onClick={onAcceptOffer}
                    isRunning={isAcceptingOffer}
                    disabled={isAcceptingOffer}
                    isPrimary={true}
                    brandColor={brandColor}
                    label="Accept offer"
                    style={{
                        width: '100%',
                        height: '40px',
                        marginTop: '28px'
                    }}
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
                style={{
                    width: '100%',
                    marginTop: '32px',
                    marginBottom: '24px'
                }}
            />
        </div>
    );
    /* eslint-enable i18next/no-literal-strings */
};

// For free members
const UpgradePlanSection = ({
    plans, selectedPlan, onPlanSelect, onPlanCheckout
}) => {
    let singlePlanClass = '';
    if (plans.length === 1) {
        singlePlanClass = 'singleplan';
    }
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

/**
 * Determines which plan section to render based on member status
 */
const planSectionRenderers = {
    upgrade: (props) => <UpgradePlanSection {...props} />,
    change: (props) => <ChangePlanSection {...props} />,
    retention: (props) => <RetentionOfferSection {...props} />,
    confirmation: (props) => <PlanConfirmationSection {...props} />
};

/**
 * Determines the plan section type to render
 * @param {Object} member - The member object
 * @param {boolean} showConfirmation - Whether confirmation is shown
 * @param {string} confirmationType - The confirmation type
 * @param {Object} pendingOffer - The pending offer
 * @returns {string} The section type key
 */
function getPlanSectionType(member, showConfirmation, confirmationType, pendingOffer) {
    if (!isPaidMember({member}) || isComplimentaryMember({member})) {
        return 'upgrade';
    }

    if (!showConfirmation) {
        return 'change';
    }

    if (confirmationType === 'offerRetention' && pendingOffer) {
        return 'retention';
    }

    return 'confirmation';
}

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);
    
    const sectionType = getPlanSectionType(member, showConfirmation, confirmationType, pendingOffer);

    if (sectionType === 'upgrade') {
        return (
            <UpgradePlanSection
                {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}}
            />
        );
    }

    if (sectionType === 'change') {
        return (
            <ChangePlanSection
                {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}}
            />
        );
    }

    if (sectionType === 'retention') {
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

    return (
        <PlanConfirmationSection
            {...{plan: confirmationPlan, type: confirmationType, onConfirm}}
        />
    );
};

/**
 * Confirmation action handlers mapped by type
 */
const confirmationActionHandlers = {
    cancel: (instance, data) => instance.onCancelSubscriptionConfirmation(data),
    changePlan: (instance) => instance.onPlanCheckout(),
    subscribe: (instance) => instance.onPlanCheckout()
};

/**
 * Determines if confirmation action should be handled
 * @param {string} confirmationType - The confirmation type
 * @returns {boolean} Whether action should be handled
 */
function isConfirmationActionType(confirmationType) {
    return confirmationType in confirmationActionHandlers;
}

export default class AccountPlanPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = this.getInitialState();
    }

    componentDidMount() {
        const {member, pageData} = this.context;
        if (!member) {
            this.context.doAction('switchPage', {
                page: 'signin'
            });
            return;
        }

        // If opened from a custom cancel button with a subscription ID, trigger the cancellation flow
        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            this.onCancelSubscription({subscriptionId: pageData.subscriptionId});
            // Clear the action so it doesn't re-trigger if the user dismisses and reopens Portal
            pageData.action = null;
        }
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    getInitialState() {
        const {member, site} = this.context;

        this.prices = getAvailablePrices({site});
        let activePrice = getMemberActivePrice({member});

        if (activePrice) {
            this.prices = getFilteredPrices({prices: this.prices, currency: activePrice.currency});
        }

        let selectedPrice = activePrice ? this.prices.find((d) => {
            return (d.id === activePrice.id);
        }) : null;

        // Select first plan as default for free member
        if (!isPaidMember({member}) && this.prices.length > 0) {
            selectedPrice = this.prices[0];
        }
        const selectedPriceId = selectedPrice ? selectedPrice.id : null;
        return {
            selectedPlan: selectedPriceId,
            pendingOffer: null,
            targetSubscriptionId: null
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

    onPlanCheckout(e, priceId) {
        const {doAction, member} = this.context;
        let {confirmationPlan, selectedPlan} = this.state;
        if (priceId) {
            selectedPlan = priceId;
        }

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            const subscriptionId = subscription ? subscription.id : '';
            if (subscriptionId) {
                doAction('updateSubscription', {plan: confirmationPlan.name, planId: confirmationPlan.id, subscriptionId, cancelAtPeriodEnd: false});
            }
        } else {
            doAction('checkoutPlan', {plan: selectedPlan});
        }
    }

    onPlanSelect = (e, priceId) => {
        e?.preventDefault();

        const {member} = this.context;

        // Work as checkboxes for free member plan selection and button for paid members
        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            // Hack: React checkbox gets out of sync with dom state with instant update
            this.timeoutId = setTimeout(() => {
                this.setState(() => {
                    return {
                        selectedPlan: priceId
                    };
                });
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

    onCancelSubscription({subscriptionId}) {
        const {member, offers} = this.context;
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }
        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffers = (offers || []).filter(o => o.redemption_type === 'retention');

        if (retentionOffers.length > 0) {
            // Show retention offer instead of going straight to cancellation
            this.setState({
                showConfirmation: true,
                confirmationPlan: subscriptionPlan,
                confirmationType: 'offerRetention',
                pendingOffer: retentionOffers[0], // Show first available offer
                targetSubscriptionId: subscriptionId
            });
        } else {
            // No retention offers, go straight to cancellation
            this.setState({
                showConfirmation: true,
                confirmationPlan: subscriptionPlan,
                confirmationType: 'cancel',
                pendingOffer: null,
                targetSubscriptionId: subscriptionId
            });
        }
    }

    onAcceptRetentionOffer() {
        const {pendingOffer, targetSubscriptionId} = this.state;

        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }

        this.context.doAction('applyOffer', {
            subscriptionId: targetSubscriptionId,
            offerId: pendingOffer.id
        });
    }

    onDeclineRetentionOffer() {
        // User declined the offer, proceed to cancellation confirmation
        this.setState({
            confirmationType: 'cancel',
            pendingOffer: null
        });
    }

    onCancelSubscriptionConfirmation(reason) {
        const {targetSubscriptionId} = this.state;
        if (!targetSubscriptionId) {
            return null;
        }
        this.context.doAction('cancelSubscription', {
            subscriptionId: targetSubscriptionId,
            cancelAtPeriodEnd: true,
            cancellationReason: reason
        });
    }

    getActivePriceId({member}) {
        const activePrice = getMemberActivePrice({member});
        if (activePrice) {
            return activePrice.id;
        }
        return null;
    }

    onConfirm(e, data) {
        const {confirmationType} = this.state;
        
        if (!isConfirmationActionType(confirmationType)) {
            return null;
        }

        const handler = confirmationActionHandlers[confirmationType];
        return handler(this, data);
    }

    render() {
        const plans = this.prices;
        const {selectedPlan, showConfirmation, confirmationPlan, confirmationType, pendingOffer} = this.state;
        const {lastPage} = this.context;
        return (
            <>
                <div className='gh-portal-content'>
                    <BackButton onClick={e => this.onBack(e)} hidden={!lastPage && !showConfirmation} />
                    <CloseButton />
                    <Header
                        onBack={e => this.onBack(e)}
                        confirmationType={confirmationType}
                        showConfirmation={showConfirmation}
                    />
                    <PlansContainer
                        {...{plans, selectedPlan, showConfirmation, confirmationPlan, confirmationType, pendingOffer}}
                        onConfirm={(...args) => this.onConfirm(...args)}
                        onCancelSubscription = {data => this.onCancelSubscription(data)}
                        onAcceptRetentionOffer = {() => this.onAcceptRetentionOffer()}
                        onDeclineRetentionOffer = {() => this.onDeclineRetentionOffer()}
                        onPlanSelect = {this.onPlanSelect}
                        onPlanCheckout = {(e, name) => this.onPlanCheckout(e, name)}
                    />
                </div>
            </>
        );
    }
}
```