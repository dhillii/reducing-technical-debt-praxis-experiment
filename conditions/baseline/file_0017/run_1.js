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

const CONFIRMATION_TITLES = {
    changePlan: t('Confirm subscription'),
    cancel: t('Cancel subscription'),
    subscribe: t('Subscribe'),
    offerRetention: 'Before you go'
};

const getConfirmationPageTitle = (confirmationType) => CONFIRMATION_TITLES[confirmationType] || '';

const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    const title = showConfirmation 
        ? getConfirmationPageTitle(confirmationType)
        : (isPaidMember({member}) ? t('Change plan') : t('Choose a plan'));
    
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
    const buttonClasses = hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : '';

    return (
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId={'cancel-subscription'}
                onClick={() => onCancelSubscription({subscriptionId: subscription.id, cancelAtPeriodEnd: true})}
                isRunning={isRunning}
                disabled={isRunning}
                isPrimary={false}
                isDestructive={true}
                classes={buttonClasses}
                brandColor={brandColor}
                label={t('Cancel subscription')}
                style={{width: '100%'}}
            />
        </div>
    );
};

const ChangePlanConfirmation = ({plan, member, subscription, site, brandColor, action, onConfirm}) => {
    const currentActivePlan = getMemberActivePrice({member});
    const planStartDate = getDateString(subscription.current_period_end);
    const planStartingMessage = currentActivePlan.id !== plan.id 
        ? t('Starting today')
        : t('Starting {startDate}', {startDate: planStartDate});
    
    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running'].includes(action);

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
                label={t('Confirm')}
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
};

const CancelConfirmation = ({subscription, brandColor, action, onConfirm}) => {
    const [reason, setReason] = useState('');
    const isRunning = ['cancelSubscription:running'].includes(action);

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

const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const subscription = getMemberSubscription({member});

    if (type === 'changePlan') {
        return (
            <ChangePlanConfirmation
                plan={plan}
                member={member}
                subscription={subscription}
                site={site}
                brandColor={brandColor}
                action={action}
                onConfirm={onConfirm}
            />
        );
    }

    return (
        <CancelConfirmation
            subscription={subscription}
            brandColor={brandColor}
            action={action}
            onConfirm={onConfirm}
        />
    );
};

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

const OFFER_MESSAGES = {
    free_months: (months, dayLabel) => {
        const monthLabel = months === 1 ? '1 month' : `${months} months`;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${dayLabel} days.`;
    },
    forever: (amountOff) => `Enjoy ${amountOff} off forever.`,
    once: (amountOff, currency, originalPrice, cadence) => 
        `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${cadence}.`,
    repeating_single: (amountOff, currency, originalPrice, cadence) =>
        `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${cadence}.`,
    repeating_multiple: (amountOff, months, currency, originalPrice, cadence) =>
        `Save ${amountOff} on your next ${months} billing cycles. Then ${currency}${originalPrice}/${cadence}.`
};

const getOfferMessage = (offer, originalPrice, currency, amountOff) => {
    if (offer.type === 'free_months') {
        const months = offer.amount;
        const dayLabel = months * 30;
        return OFFER_MESSAGES.free_months(months, dayLabel);
    }

    if (offer.duration === 'forever') {
        return OFFER_MESSAGES.forever(amountOff);
    }

    if (offer.duration === 'once') {
        return OFFER_MESSAGES.once(amountOff, currency, originalPrice, offer.cadence);
    }

    if (offer.duration === 'repeating') {
        if (offer.duration_in_months === 1) {
            return OFFER_MESSAGES.repeating_single(amountOff, currency, originalPrice, offer.cadence);
        }
        return OFFER_MESSAGES.repeating_multiple(amountOff, offer.duration_in_months, currency, originalPrice, offer.cadence);
    }

    return '';
};

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);
    const cadenceLabel = offer.cadence === 'month' ? 'Monthly' : 'Yearly';

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer">
            <p className="gh-portal-text-center">
                {'We\'d hate to see you go! How about a special offer to stay?'}
            </p>

            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4>{product.name} - {cadenceLabel}</h4>
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

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {