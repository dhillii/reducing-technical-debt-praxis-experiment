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

// Constants
const CONFIRMATION_TITLES = {
    changePlan: () => t('Confirm subscription'),
    cancel: () => t('Cancel subscription'),
    subscribe: () => t('Subscribe'),
    offerRetention: () => 'Before you go'
};

const RUNNING_ACTIONS = {
    cancel: 'cancelSubscription:running',
    update: 'updateSubscription:running',
    checkout: 'checkoutPlan:running',
    offer: 'applyOffer:running'
};

// Utility functions
const getConfirmationPageTitle = (confirmationType) => {
    return CONFIRMATION_TITLES[confirmationType]?.() || '';
};

const isActionRunning = (action, actionType) => {
    const actions = Array.isArray(actionType) ? actionType : [actionType];
    return actions.includes(action);
};

const getOfferMessage = (offer, originalPrice, currency, amountOff) => {
    const offerTypeHandlers = {
        free_months: () => {
            const months = offer.amount;
            const monthLabel = months === 1 ? '1 month' : `${months} months`;
            const dayLabel = months * 30;
            return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${dayLabel} days.`;
        },
        forever: () => `Enjoy ${amountOff} off forever.`,
        once: () => `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`,
        repeating_single: () => `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`,
        repeating_multiple: () => `Save ${amountOff} on your next ${offer.duration_in_months} billing cycles. Then ${currency}${originalPrice}/${offer.cadence}.`
    };

    if (offer.type === 'free_months') {
        return offerTypeHandlers.free_months();
    }

    if (offer.duration === 'forever') {
        return offerTypeHandlers.forever();
    }

    if (offer.duration === 'once') {
        return offerTypeHandlers.once();
    }

    if (offer.duration === 'repeating') {
        return offer.duration_in_months === 1 
            ? offerTypeHandlers.repeating_single() 
            : offerTypeHandlers.repeating_multiple();
    }

    return '';
};

// Components
const Header = ({showConfirmation, confirmationType, member}) => {
    const title = showConfirmation 
        ? getConfirmationPageTitle(confirmationType)
        : (isPaidMember({member}) ? t('Change plan') : t('Choose a plan'));
    
    return (
        <header className='gh-portal-detail-header'>
            <h3 className='gh-portal-main-title'>{title}</h3>
        </header>
    );
};

const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor, site}) => {
    if (!member?.paid) {
        return null;
    }

    const subscription = getMemberSubscription({member});
    if (!subscription?.id || subscription.cancel_at_period_end) {
        return null;
    }

    const isRunning = isActionRunning(action, RUNNING_ACTIONS.cancel);
    const label = t('Cancel subscription');

    return (
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId={'cancel-subscription'}
                onClick={() => onCancelSubscription({subscriptionId: subscription.id, cancelAtPeriodEnd: true})}
                isRunning={isRunning}
                disabled={isRunning}
                isPrimary={false}
                isDestructive={true}
                classes={hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : ''}
                brandColor={brandColor}
                label={label}
                style={{width: '100%'}}
            />
        </div>
    );
};

const PlansOrProductSection = ({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) => {
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
};

const PlanConfirmationSection = ({plan, type, onConfirm, member, subscription, site, brandColor, action}) => {
    const [reason, setReason] = useState('');
    const isRunning = isActionRunning(action, [RUNNING_ACTIONS.update, RUNNING_ACTIONS.checkout, RUNNING_ACTIONS.cancel]);
    const label = t('Confirm');
    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member});
    const planStartingMessage = currentActivePlan.id !== plan.id ? t('Starting today') : t('Starting {startDate}', {startDate: planStartDate});
    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');

    if (type === 'changePlan') {
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
                    mapping={{periodEnd: <strong>{getDateString(subscription.current_period_end)}</strong>}}
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
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
};

const ChangePlanSection = ({plans, selectedPlan, onPlanSelect, onCancelSubscription, member, action, brandColor, site}) => {
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
            <CancelSubscriptionButton {...{member, onCancelSubscription, action, brandColor, site}} />
        </section>
    );
};

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

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer, brandColor, action}) => {
    const isAcceptingOffer = isActionRunning(action, RUNNING_ACTIONS.offer);
    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);

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

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site, action, brandColor} = useContext(AppContext);
    const subscription = getMemberSubscription({member});

    // Free or complimentary member upgrade flow
    if (!isPaidMember({member}) || isComplimentaryMember({member})) {
        return <UpgradePlanSection {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}} />;
    }

    // Paid member plan change flow (no confirmation)
    if (!showConfirmation) {
        return (
            <ChangePlanSection
                {...{plans, selectedPlan, onPlanSelect, onCancelSubscription, member, action, brandColor, site}}
            />
        );
    }

    // Retention offer flow
    if (confirmationType === 'offerRetention' && pendingOffer) {
        const offerProduct = pendingOffer.tier