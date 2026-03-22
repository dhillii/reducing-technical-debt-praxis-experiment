# Refactored AccountPlanPage

## Key Changes Made

1. **Converted class component to functional component** - Eliminates `this` binding complexity and lifecycle method boilerplate
2. **Extracted custom hooks** - `usePlanState` and `usePlanActions` separate state logic from rendering
3. **Simplified `getConfirmationPageTitle`** - Replaced if/else chain with a lookup map
4. **Simplified `getOfferMessage`** - Replaced if/else chain with early returns and clearer structure
5. **Extracted `RetentionOfferPrice`** - Decomposed large JSX block into focused sub-component
6. **Simplified `CancelSubscriptionButton`** - Removed redundant boolean expressions
7. **Removed dead code** - Commented-out code in `UpgradePlanSection`

```jsx
import React, {useContext, useState, useEffect, useRef, useCallback} from 'react';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import CloseButton from '../common/close-button';
import BackButton from '../common/back-button';
import {MultipleProductsPlansSection} from '../common/plans-section';
import {getDateString} from '../../utils/date-time';
import {
    formatNumber, getAvailablePrices, getCurrencySymbol, getFilteredPrices,
    getMemberActivePrice, getMemberActiveProduct, getMemberSubscription,
    getOfferOffAmount, getPriceFromSubscription, getProductFromId,
    getProductFromPrice, getSubscriptionFromId, getUpdatedOfferPrice,
    getUpgradeProducts, hasMultipleProductsFeature, isComplimentaryMember, isPaidMember
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

// --- Utilities ---

const CONFIRMATION_TITLES = {
    changePlan: () => t('Confirm subscription'),
    cancel: () => t('Cancel subscription'),
    subscribe: () => t('Subscribe'),
    offerRetention: () => 'Before you go'
};

function getConfirmationPageTitle({confirmationType}) {
    return CONFIRMATION_TITLES[confirmationType]?.() ?? '';
}

function getOfferMessage(offer, originalPrice, currency, amountOff) {
    if (offer.type === 'free_months') {
        const months = offer.amount;
        const monthLabel = months === 1 ? '1 month' : `${months} months`;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${months * 30} days.`;
    }

    const nextBillingText = `Then ${currency}${originalPrice}/${offer.cadence}.`;

    if (offer.duration === 'forever') {
        return `Enjoy ${amountOff} off forever.`;
    }

    if (offer.duration === 'once' || (offer.duration === 'repeating' && offer.duration_in_months === 1)) {
        return `Save ${amountOff} on your next billing cycle. ${nextBillingText}`;
    }

    if (offer.duration === 'repeating' && offer.duration_in_months > 1) {
        return `Save ${amountOff} on your next ${offer.duration_in_months} billing cycles. ${nextBillingText}`;
    }

    return '';
}

// --- Custom Hooks ---

function useInitialPrices(member, site) {
    const prices = getAvailablePrices({site});
    const activePrice = getMemberActivePrice({member});
    const filteredPrices = activePrice
        ? getFilteredPrices({prices, currency: activePrice.currency})
        : prices;

    const defaultSelected = (() => {
        if (activePrice) {
            return filteredPrices.find(d => d.id === activePrice.id) ?? null;
        }
        if (!isPaidMember({member}) && filteredPrices.length > 0) {
            return filteredPrices[0];
        }
        return null;
    })();

    return {prices: filteredPrices, selectedPriceId: defaultSelected?.id ?? null};
}

const INITIAL_CONFIRMATION_STATE = {
    showConfirmation: false,
    confirmationPlan: null,
    confirmationType: null,
    pendingOffer: null,
    targetSubscriptionId: null
};

function usePlanState(member, site) {
    const {prices, selectedPriceId} = useInitialPrices(member, site);
    const [selectedPlan, setSelectedPlan] = useState(selectedPriceId);
    const [confirmationState, setConfirmationState] = useState(INITIAL_CONFIRMATION_STATE);

    const cancelConfirmPage = useCallback(() => {
        setConfirmationState(INITIAL_CONFIRMATION_STATE);
    }, []);

    const showCancellationFlow = useCallback((subscriptionPlan, subscriptionId, offer = null) => {
        setConfirmationState({
            showConfirmation: true,
            confirmationPlan: subscriptionPlan,
            confirmationType: offer ? 'offerRetention' : 'cancel',
            pendingOffer: offer,
            targetSubscriptionId: subscriptionId
        });
    }, []);

    const showPlanConfirmation = useCallback((confirmationPrice, confirmationType) => {
        setConfirmationState(prev => ({
            ...prev,
            showConfirmation: true,
            confirmationPlan: confirmationPrice,
            confirmationType
        }));
    }, []);

    return {
        prices,
        selectedPlan,
        setSelectedPlan,
        confirmationState,
        cancelConfirmPage,
        showCancellationFlow,
        showPlanConfirmation,
        setConfirmationState
    };
}

function usePlanActions({member, site, offers, doAction, prices, planState}) {
    const {
        selectedPlan, confirmationState, cancelConfirmPage,
        showCancellationFlow, showPlanConfirmation,
        setSelectedPlan, setConfirmationState
    } = planState;

    const timeoutRef = useRef(null);

    useEffect(() => () => clearTimeout(timeoutRef.current), []);

    const getActivePriceId = useCallback(() => {
        return getMemberActivePrice({member})?.id ?? null;
    }, [member]);

    const onPlanSelect = useCallback((e, priceId) => {
        e?.preventDefault();

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            timeoutRef.current = setTimeout(() => setSelectedPlan(priceId), 5);
            return;
        }

        if (priceId === selectedPlan) {
            return;
        }

        const confirmationPrice = prices.find(d => d.id === priceId);
        const confirmationType = getActivePriceId() ? 'changePlan' : 'subscribe';
        showPlanConfirmation(confirmationPrice, confirmationType);
    }, [member, selectedPlan, prices, getActivePriceId, showPlanConfirmation, setSelectedPlan]);

    const onPlanCheckout = useCallback((e, priceId) => {
        const {confirmationPlan} = confirmationState;
        const effectivePlan = priceId || selectedPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            const subscriptionId = subscription?.id;
            if (subscriptionId && confirmationPlan) {
                doAction('updateSubscription', {
                    plan: confirmationPlan.name,
                    planId: confirmationPlan.id,
                    subscriptionId,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: effectivePlan});
        }
    }, [member, confirmationState, selectedPlan, doAction]);

    const onCancelSubscription = useCallback(({subscriptionId}) => {
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffer = (offers || []).find(o => o.redemption_type === 'retention');

        showCancellationFlow(subscriptionPlan, subscriptionId, retentionOffer ?? null);
    }, [member, offers, showCancellationFlow]);

    const onAcceptRetentionOffer = useCallback(() => {
        const {pendingOffer, targetSubscriptionId} = confirmationState;
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    }, [confirmationState, doAction]);

    const onDeclineRetentionOffer = useCallback(() => {
        setConfirmationState(prev => ({...prev, confirmationType: 'cancel', pendingOffer: null}));
    }, [setConfirmationState]);

    const onCancelSubscriptionConfirmation = useCallback((reason) => {
        const {targetSubscriptionId} = confirmationState;
        if (!targetSubscriptionId) {
            return;
        }
        doAction('cancelSubscription', {
            subscriptionId: targetSubscriptionId,
            cancelAtPeriodEnd: true,
            cancellationReason: reason
        });
    }, [confirmationState, doAction]);

    const onConfirm = useCallback((e, data) => {
        const {confirmationType} = confirmationState;
        if (confirmationType === 'cancel') {
            return onCancelSubscriptionConfirmation(data);
        }
        if (['changePlan', 'subscribe'].includes(confirmationType)) {
            return onPlanCheckout();
        }
    }, [confirmationState, onCancelSubscriptionConfirmation, onPlanCheckout]);

    return {
        onPlanSelect,
        onPlanCheckout,
        onCancelSubscription,
        onAcceptRetentionOffer,
        onDeclineRetentionOffer,
        onConfirm,
        cancelConfirmPage
    };
}

// --- Sub-components ---

const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    const defaultTitle = isPaidMember({member}) ? t('Change plan') : t('Choose a plan');
    const title = showConfirmation ? getConfirmationPageTitle({confirmationType}) : defaultTitle;

    return (
        <header className='gh-portal-detail-header'>
            <h3 className='gh-portal-main-title'>{title}</h3>
        </header>
    );
};

const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    const subscription = getMemberSubscription({member});

    if (!member.paid || !subscription || subscription.cancel_at_period_end) {
        return null;
    }

    const isRunning = action === 'cancelSubscription:running';

    return (
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId='cancel-subscription'
                onClick={() => onCancelSubscription({
                    subscriptionId: subscription.id,
                    cancelAtPeriodEnd: true
                })}
                isRunning={isRunning}
                disabled={isRunning}
                isPrimary={!!subscription.cancel_at_period_end}
                isDestructive={!subscription.cancelAtPeriodEnd}
                classes={hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : ''}
                brandColor={brandColor}
                label={t('Cancel subscription')}
                style={{width: '100%'}}
            />
        </div>
    );
};

const ChangePlanConfirmation = ({plan, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const subscription = getMemberSubscription({member});
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);

    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member});
    const planStartingMessage = currentActivePlan.id !== plan.id ? t('Starting today') : t('Starting {startDate}', {startDate: planStartDate});
    const planStartMessage = `${plan.currency_symbol}${formatNumber(plan.price)}/${t(plan.interval)} – ${planStartingMessage}`;
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
                dataTestId='confirm-action'
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

const CancelConfirmation = ({onConfirm}) => {
    const {action, member, brandColor} = useContext(AppContext);
    const [reason, setReason] = useState('');
    const subscription = getMemberSubscription({member});
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-cancellation-form">
            <p>
                <Interpolate
                    string={t('If you cancel your subscription now, you will continue to have access until {periodEnd}.')}
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
                dataTestId='confirm-cancel-subscription'
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
    if (type === 'changePlan') {
        return <ChangePlanConfirmation plan={plan} onConfirm={onConfirm} />;
    }
    return <CancelConfirmation onConfirm={onConfirm} />;
};

function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});
    const displayProducts = products.length > 0 || isComplimentary || !activeProduct
        ? products
        : [activeProduct];

    return (
        <MultipleProductsPlansSection
            products={displayProducts}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
        />
    );
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
            <CancelSubscriptionButton {...{member, onCancelSubscription, action, brandColor}} />
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

const RetentionOfferPrice = ({offer, currency, discountedPrice, originalPrice}) => {
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

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
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
                        <RetentionOfferPrice
                            offer={offer}
                            currency={currency}
                            discountedPrice={discountedPrice}
                            originalPrice={originalPrice}
                        />
                    </div>
                    <p className="footnote">
                        {getOfferMessage(offer, originalPrice, currency, amountOff)}
                    </p>
                </div>
                <ActionButton
                    dataTestId='accept-retention-offer'
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
                dataTestId='decline-retention-offer'
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive={true}
                classes='gh-portal-btn-text'
                brandColor={brandColor}
                label="No thanks, I want to cancel"
                style={{width: '100%', marginTop: '32px', marginBottom: '24px'}}
            />
        </div>
    );
};

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType,
    showConfirmation = false, pendingOffer,
    onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);

    if (!isPaidMember({member}) || isComplimentaryMember({member})) {
        return (
            <UpgradePlanSection {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}} />
        );
    }

    if (!showConfirmation) {
        return (
            <ChangePlanSection {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}} />
        );
    }

    if (confirmationType === 'offerRetention' && pendingOffer) {
        const offerProduct = pendingOffer.tier
            ? getProductFromId({site, productId: pendingOffer.tier.id})
            : getMemberActiveProduct({member, site});
        const offerPrice = pendingOffer.cadence === 'month'
            ? offerProduct?.monthlyPrice
            : offerProduct?.yearlyPrice;

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
            plan={confirmationPlan}
            type={confirmationType}
            onConfirm={onConfirm}
        />
    );
};

// --- Main Page Component ---

export default function AccountPlanPage() {
    const context = useContext(AppContext);
    const {member, site, offers, doAction, lastPage, pageData} = context;

    const planState = usePlanState(member, site);
    const actions = usePlanActions({member, site, offers, doAction, prices: planState.prices, planState});

    const {selectedPlan, confirmationState} = planState;
    const {showConfirmation, confirmationPlan, confirmationType, pendingOffer} = confirmationState;

    useEffect(() => {
        if (!member) {
            doAction('switchPage', {page: 'signin'});
            return;
        }

        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            actions.onCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const onBack = useCallback(() => {
        if (showConfirmation) {
            planState.cancelConfirmPage();
        } else {
            doAction('back');
        }
    }, [showConfirmation, planState, doAction]);

    return (
        <div className='gh-portal-content'>
            <BackButton onClick={onBack} hidden={!lastPage && !showConfirmation} />
            <CloseButton />
            <Header showConfirmation={showConfirmation} confirmationType={confirmationType} />
            <PlansContainer
                plans={planState.prices}
                selectedPlan={selectedPlan}
                showConfirmation={showConfirmation}
                confirmationPlan={confirmationPlan}
                confirmationType={confirmationType}
                pendingOffer={pendingOffer}
                onConfirm={actions.onConfirm}
                onCancelSubscription={actions.onCancelSubscription}
                onAcceptRetentionOffer={actions.onAcceptRetentionOffer}
                onDeclineRetentionOffer={actions.onDeclineRetentionOffer}
                onPlanSelect={actions.onPlanSelect}
                onPlanCheckout={actions.onPlanCheckout}
            />
        </div>
    );
}
```

## Summary of Improvements

| Issue | Before | After |
|---|---|---|
| Component type | Class component with `this` binding | Functional component with hooks |
| State management | Scattered across class methods | `usePlanState` + `usePlanActions` hooks |
| `getConfirmationPageTitle` | 4-branch if/else chain | Lookup map with optional chaining |
| `getOfferMessage` | 6-branch if/else | Early return + consolidated duplicate branches |
| `PlanConfirmationSection` | Single large component with type branching | Split into `ChangePlanConfirmation` + `CancelConfirmation` |
| `RetentionOfferSection` | Inline conditional JSX block | Extracted `RetentionOfferPrice` sub-component |
| `CancelSubscriptionButton` | Redundant `disabled` and `isPrimary` expressions | Simplified boolean logic |
| Dead code | Commented-out JSX in `UpgradePlanSection` | Removed entirely |
| Fragment wrapper | Unnecessary `<>` wrapper in render | Removed |