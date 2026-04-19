```javascript
import React, {useContext, useState} from 'react';
import PropTypes from 'prop-types';
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
 * Returns the appropriate confirmation page title based on the confirmation type.
 * @param {Object} params - Object containing confirmationType
 * @param {string} params.confirmationType - Type of confirmation action
 * @returns {string} - Localized title string
 */
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
    return 'Before you go';
}

/**
 * Header component for the account plan page.
 * Displays the main title based on member status and confirmation state.
 * @param {Object} props - Component props
 * @param {boolean} props.showConfirmation - Whether confirmation is shown
 * @param {string} props.confirmationType - Type of confirmation
 */
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
 * Button component for canceling subscriptions.
 * Conditionally renders based on member payment status and subscription state.
 * @param {Object} props - Component props
 * @param {Object} props.member - Member object
 * @param {Function} props.onCancelSubscription - Callback for cancellation
 * @param {string} props.action - Current action state
 * @param {string} props.brandColor - Brand color for styling
 */
const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    if (!member.paid) {
        return null;
    }
    const subscription = getMemberSubscription({member});
    if (!subscription) {
        return null;
    }
    if (subscription.cancel_at_period_end) {
        return null;
    }
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
 * Section component for plan confirmation flows.
 * Handles both plan changes and subscription cancellations.
 * @param {Object} props - Component props
 * @param {Object} props.plan - Plan object with price information
 * @param {string} props.type - Type of confirmation
 * @param {Function} props.onConfirm - Callback for confirmation
 */
const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const [reason, setReason] = useState('');
    const subscription = getMemberSubscription({member});
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);
    const label = t('Confirm');
    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member});
    let planStartingMessage = t('Starting {startDate}', {startDate: planStartDate});
    if (currentActivePlan.id !== plan.id) {
        planStartingMessage = t('Starting today');
    }
    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');

    const renderChangePlanContent = () => (
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

    const renderCancellationContent = () => (
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

    if (type === 'changePlan') {
        return renderChangePlanContent();
    }
    return renderCancellationContent();
};

/**
 * Section component for paid members to change their plan.
 * Displays available plans and cancellation options.
 * @param {Object} props - Component props
 * @param {Array} props.plans - Array of available plans
 * @param {string} props.selectedPlan - Currently selected plan ID
 * @param {Function} props.onPlanSelect - Callback for plan selection
 * @param {Function} props.onCancelSubscription - Callback for cancellation
 */
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

/**
 * Section component for displaying plans or products.
 * Handles both single and multiple product scenarios.
 * @param {Object} props - Component props
 * @param {string} props.selectedPlan - Currently selected plan ID
 * @param {Function} props.onPlanSelect - Callback for plan selection
 * @param {Function} props.onPlanCheckout - Callback for checkout
 * @param {boolean} props.changePlan - Whether this is a plan change flow
 */
function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});
    const displayProducts = products.length > 0 || isComplimentary || !activeProduct ? products : [activeProduct];

    return (
        <MultipleProductsPlansSection
            products={displayProducts}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
        />
    );
};

/**
 * Generates offer message based on offer type and duration.
 * @param {Object} offer - Offer object with type and duration
 * @param {number} originalPrice - Original price amount
 * @param {string} currency - Currency symbol
 * @param {number} amountOff - Discount amount
 * @returns {string} - Formatted offer message
 */
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
    if (offer.duration === 'once') {
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }
    if (offer.duration === 'repeating' && offer.duration_in_months === 1) {
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }
    if (offer.duration === 'repeating' && offer.duration_in_months > 1) {
        return `Save ${amountOff} on your next ${offer.duration_in_months} billing cycles. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }
    return '';
}

/**
 * Section component for retention offers to encourage members to stay.
 * @param {Object} props - Component props
 * @param {Object} props.offer - Retention offer object
 * @param {Object} props.product - Product object
 * @param {Object} props.price - Price object with currency
 * @param {Function} props.onAcceptOffer - Callback for accepting offer
 * @param {Function} props.onDeclineOffer - Callback for declining offer
 */
const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);

    const renderPriceDisplay = () => {
        if (offer.type === 'free_months') {
            return null;
        }
        return (
            <>
                <div className="gh-portal-product-price">
                    <span className="currency-sign">{currency}</span>
                    <span className="amount">{discountedPrice}</span>
                </div>
                <div className="gh-portal-offer-oldprice">
                    {currency}{originalPrice}
                </div>
            </>
        );
    };

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
                        {renderPriceDisplay()}
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
};

/**
 * Section component for free members to upgrade their plan.
 * @param {Object} props - Component props
 * @param {Array} props.plans - Array of available plans
 * @param {string} props.selectedPlan - Currently selected plan ID
 * @param {Function} props.onPlanSelect - Callback for plan selection
 * @param {Function} props.onPlanCheckout - Callback for checkout
 */
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
 * Container component that orchestrates different plan display flows.
 * Routes to appropriate section based on member status and confirmation state.
 * @param {Object} props - Component props
 * @param {Array} props.plans - Array of available plans
 * @param {string} props.selectedPlan - Currently selected plan ID
 * @param {Object} props.confirmationPlan - Plan for confirmation
 * @param {string} props.confirmationType - Type of confirmation
 * @param {boolean} props.showConfirmation - Whether confirmation is shown
 * @param {Object} props.pendingOffer - Pending retention offer
 * @param {Function} props.onPlanSelect - Callback for plan selection
 * @param {Function} props.onPlanCheckout - Callback for checkout
 * @param {Function} props.onConfirm - Callback for confirmation
 * @param {Function} props.onCancelSubscription - Callback for cancellation
 * @param {Function} props.onAcceptRetentionOffer - Callback for accepting retention offer
 * @param {Function} props.onDeclineRetentionOffer - Callback for declining retention offer
 */
const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);

    if (!isPaidMember({member}) || isComplimentaryMember({member})) {
        return (
            <UpgradePlanSection
                {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}}
            />
        );
    }

    if (!showConfirmation) {
        return (
            <ChangePlanSection
                {...{plans, selectedPlan,
                    onCancelSubscription, onPlanSelect}}
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

    return (
        <PlanConfirmationSection
            {...{plan: confirmationPlan, type: confirmationType, onConfirm}}
        />
    );
};

/**
 * Account plan page component for managing member subscriptions.
 * Handles plan selection, upgrades, cancellations, and retention offers.
 */
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

        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            this.onCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    /**
     * Initializes component state with member's current plan information.
     * @returns {Object} Initial state object
     */
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

    /**
     * Cancels the confirmation page and resets related state.
     */
    cancelConfirmPage() {
        this.setState({
            showConfirmation: false,
            confirmationPlan: null,
            confirmationType: null,
            pendingOffer: null,
            targetSubscriptionId: null
        });
    }

    /**
     * Handles plan checkout flow for both paid and free members.
     * @param {Event} e - Click event
     * @param {string} priceId - Selected plan price ID
     */
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

    /**
     * Handles plan selection with different behavior for paid vs free members.
     * @param {Event} e - Click event
     * @param {string} priceId - Selected plan price ID
     */
    onPlanSelect = (e, priceId) => {
        e?.preventDefault();

        const {member} = this.context;

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
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

    /**
     * Initiates subscription cancellation flow with optional retention offer.
     * @param {Object} params - Cancellation parameters
     * @param {string} params.subscriptionId - Subscription ID to cancel
     */
    onCancelSubscription({subscriptionId}) {
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
    }

    /**
     * Applies retention offer to member's subscription.
     */
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

    /**
     * Proceeds to cancellation after declining retention offer.
     */
    onDeclineRetentionOffer() {
        this.setState({
            confirmationType: 'cancel',
            pendingOffer: null
        });
    }

    /**
     * Confirms cancellation with optional reason.
     * @param {string} reason - Cancellation reason
     */
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

    /**
     * Retrieves the active plan ID for the current member.
     * @param {Object} params - Member object
     * @returns {string|null} Active plan ID or null
     */
    getActivePriceId({member}) {
        const activePrice = getMemberActivePrice({member});
        if (activePrice) {
            return activePrice.id;
        }
        return null;
    }

    /**
     * Handles confirmation based on confirmation type.
     * @param {Event} e - Click event
     * @param {Object} data - Confirmation data
     */
    onConfirm(e, data) {
        const {confirmationType} = this.state;
        if (confirmationType === 'cancel') {
            return this.onCancelSubscriptionConfirmation(data);
        }
        if (['changePlan', 'subscribe'].includes(confirmationType)) {
            return this.onPlanCheckout();
        }
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
};

/**
 * Validates price object props for plan components.
 * Ensures currency field is present and properly typed.
 */
PriceProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    price: PropTypes.number.isRequired,
    currency: PropTypes.string.isRequired,
    currency_symbol: PropTypes.string.isRequired,
    interval: PropTypes.string.isRequired
});

/**
 * Validates plan object props for plan components.
 * Ensures all required fields are present and properly typed.
 */
PlanProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    price: PropTypes.number.isRequired,
    currency: PropTypes.string.isRequired,
    currency_symbol: PropTypes.string.isRequired,
    interval: PropTypes.string.isRequired
});

/**
 * Validates offer object props for retention offer components.
 * Ensures offer type and duration fields are present.
 */
OfferProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    duration: PropTypes.string.isRequired,
    duration_in_months: PropTypes.number,
    amount: PropTypes.number,
    cadence: PropTypes.string.isRequired,
    redemption_type: PropTypes.string.isRequired
});

/**
 * Validates member object props for member-related components.
 * Ensures member status fields are present.
 */
MemberProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    paid: PropTypes.bool.isRequired
});

/**
 * Validates subscription object props for subscription-related components.
 * Ensures subscription status fields are present.
 */
SubscriptionProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    cancel_at_period_end: PropTypes.bool.isRequired,
    cancelAtPeriodEnd: PropTypes.bool.isRequired
});

/**
 * Validates price object props for retention offer components.
 * Ensures currency field is present and properly typed.
 */
PriceWithCurrencyProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
    currency: PropTypes.string.isRequired
});

/**
 * Validates site object props for site-related components.
 * Ensures site ID field is present.
 */
SiteProps = PropTypes.shape({
    id: PropTypes.string.isRequired
});

/**
 * Validates action object props for action-related components.
 * Ensures action ID field is present.
 */
ActionProps = PropTypes.shape({
    id: PropTypes.string.isRequired
});

/**
 * Validates context object props for context-related components.
 * Ensures context fields are present.
 */
ContextProps = PropTypes.shape({
    member: MemberProps,
    site: SiteProps,
    action: ActionProps,
    offers: PropTypes.arrayOf(OfferProps)
});

/**
 * Validates confirmation plan props for confirmation components.
 * Ensures plan object has all required fields.
 */
ConfirmationPlanProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    price: PropTypes.number.isRequired,
    currency: PropTypes.string.isRequired,
    currency_symbol: PropTypes.string.isRequired,
    interval: PropTypes.string.isRequired
});

/**
 * Validates confirmation type props for confirmation components.
 * Ensures confirmation type is a valid string.
 */
ConfirmationTypeProps = PropTypes.oneOf(['changePlan', 'cancel', 'subscribe', 'offerRetention']);

/**
 * Validates show confirmation props for confirmation components.
 * Ensures show confirmation is a boolean.
 */
ShowConfirmationProps = PropTypes.bool;

/**
 * Validates pending offer props for retention offer components.
 * Ensures pending offer object has all required fields.
 */
PendingOfferProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    tier: PropTypes.shape({
        id: PropTypes.string.isRequired
    }),
    cadence: PropTypes.string.isRequired
});

/**
 * Validates product object props for product-related components.
 * Ensures product name field is present.
 */
ProductProps = PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    monthlyPrice: PropTypes.number.isRequired,
    yearlyPrice: PropTypes.number.isRequired
});

/**
 * Validates plans array props for plans container components.
 * Ensures plans array contains valid plan objects.
 */
PlansProps = PropTypes.arrayOf(PlanProps);

/**
 * Validates selected plan props for plan selection components.
 * Ensures selected plan is a valid string ID.
 */
SelectedPlanProps = PropTypes.string;

/**
 * Validates onPlanSelect callback props for plan selection components.
 * Ensures callback function is present.
 */
OnPlanSelectProps = PropTypes.func;

/**
 * Validates onPlanCheckout callback props for checkout components.
 * Ensures callback function is present.
 */
OnPlanCheckoutProps = PropTypes.func;

/**
 * Validates onConfirm callback props for confirmation components.
 * Ensures callback function is present.
 */
OnConfirmProps = PropTypes.func;

/**
 * Validates onCancelSubscription callback props for cancellation components.
 * Ensures callback function is present.
 */
OnCancelSubscriptionProps = PropTypes.func;

/**
 * Validates onAcceptRetentionOffer callback props for retention offer components.
 * Ensures callback function is present.
 */
OnAcceptRetentionOfferProps = PropTypes.func;

/**
 * Validates onDeclineRetentionOffer callback props for retention offer components.
 * Ensures callback function is present.
 */
OnDeclineRetentionOfferProps = PropTypes.func;

/**
 * Validates Header component props.
 * Ensures confirmation type and show confirmation fields are present.
 */
HeaderProps = PropTypes.shape({
    showConfirmation: ShowConfirmationProps,
    confirmationType: ConfirmationTypeProps
});

/**
 * Validates CancelSubscriptionButton component props.
 * Ensures all required callback and member fields are present.
 */
CancelSubscriptionButtonProps = PropTypes.shape({
    member: MemberProps,
    onCancelSubscription: OnCancelSubscriptionProps,
    action: ActionProps,
    brandColor: PropTypes.string
});

/**
 * Validates PlanConfirmationSection component props.
 * Ensures plan object and confirmation callback are present.
 */
PlanConfirmationSectionProps = PropTypes.shape({
    plan: PlanProps,
    type: ConfirmationTypeProps,
    onConfirm: OnConfirmProps
});

/**
 * Validates ChangePlanSection component props.
 * Ensures all required plan and callback fields are present.
 */
ChangePlanSectionProps = PropTypes.shape({
    plans: PlansProps,
    selectedPlan: SelectedPlanProps,
    onPlanSelect: OnPlanSelectProps,
    onCancelSubscription: OnCancelSubscriptionProps
});

/**
 * Validates PlansOrProductSection component props.
 * Ensures all required plan and callback fields are present.
 */
PlansOrProductSectionProps = PropTypes.shape({
    selectedPlan: SelectedPlanProps,
    onPlanSelect: OnPlanSelectProps,
    onPlanCheckout: OnPlanCheckoutProps,
    changePlan: PropTypes.bool
});

/**
 * Validates RetentionOfferSection component props.
 * Ensures all required offer, product, and price fields are present.
 */
RetentionOfferSectionProps = PropTypes.shape({
    offer: OfferProps,
    product: ProductProps,
    price: PriceWithCurrencyProps,
    onAcceptOffer: OnAcceptRetentionOfferProps,
    onDeclineOffer: OnDeclineRetentionOfferProps
});

/**
 * Validates UpgradePlanSection component props.
 * Ensures all required plan and callback fields are present.
 */
UpgradePlanSectionProps = PropTypes.shape({
    plans: PlansProps,
    selectedPlan: SelectedPlanProps,
    onPlanSelect: OnPlanSelectProps,
    onPlanCheckout: OnPlanCheckoutProps
});

/**
 * Validates PlansContainer component props.
 * Ensures all required plan, confirmation, and callback fields are present.
 */
PlansContainerProps = PropTypes.shape({
    plans: PlansProps,
    selectedPlan: SelectedPlanProps,
    confirmationPlan: ConfirmationPlanProps,
    confirmationType: ConfirmationTypeProps,
    showConfirmation: ShowConfirmationProps,
    pendingOffer: PendingOfferProps,
    onPlanSelect: OnPlanSelectProps,
    onPlanCheckout: OnPlanCheckoutProps,
    onConfirm: OnConfirmProps,
    onCancelSubscription: OnCancelSubscriptionProps,
    onAcceptRetentionOffer: OnAcceptRetentionOfferProps,
    onDeclineRetentionOffer: OnDeclineRetentionOfferProps
});

/**
 * Validates AccountPlanPage component props.
 * Ensures all required context and callback fields are present.
 */
AccountPlanPageProps = PropTypes.shape({});

/**
 * Validates getConfirmationPageTitle function props.
 * Ensures confirmation type field is present.
 */
getConfirmationPageTitleProps = PropTypes.shape({
    confirmationType: ConfirmationTypeProps
});

/**
 * Validates getOfferMessage function props.
 * Ensures all required offer and price fields are present.
 */
getOfferMessageProps = PropTypes.shape({
    offer: OfferProps,
    originalPrice: PropTypes.number,
    currency: PropTypes.string,
    amountOff: PropTypes.number
});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates cancelConfirmPage function props.
 * Ensures no additional props are required.
 */
cancelConfirmPageProps = PropTypes.shape({});

/**
 * Validates onBack function props.
 * Ensures no additional props are required.
 */
onBackProps = PropTypes.shape({});

/**
 * Validates handleSignout function props.
 * Ensures event field is present.
 */
handleSignoutProps = PropTypes.shape({
    e: PropTypes.object
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: MemberProps
});

/**
 * Validates onConfirm function props.
 * Ensures event and data fields are present.
 */
onConfirmProps = PropTypes.shape({
    e: PropTypes.object,
    data: PropTypes.object
});

/**
 * Validates onCancelSubscriptionConfirmation function props.
 * Ensures reason field is present.
 */
onCancelSubscriptionConfirmationProps = PropTypes.shape({
    reason: PropTypes.string
});

/**
 * Validates onAcceptRetentionOffer function props.
 * Ensures no additional props are required.
 */
onAcceptRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onDeclineRetentionOffer function props.
 * Ensures no additional props are required.
 */
onDeclineRetentionOfferProps = PropTypes.shape({});

/**
 * Validates onPlanCheckout function props.
 * Ensures event and price ID fields are present.
 */
onPlanCheckoutProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onPlanSelect function props.
 * Ensures event and price ID fields are present.
 */
onPlanSelectProps = PropTypes.shape({
    e: PropTypes.object,
    priceId: PropTypes.string
});

/**
 * Validates onCancelSubscription function props.
 * Ensures subscription ID field is present.
 */
onCancelSubscriptionProps = PropTypes.shape({
    subscriptionId: PropTypes.string
});

/**
 * Validates getInitialState function props.
 * Ensures no additional props are required.
 */
getInitialStateProps = PropTypes.shape({});

/**
 * Validates getActivePriceId function props.
 * Ensures member field is present.
 */
getActivePriceIdProps = PropTypes.shape({
    member: Member