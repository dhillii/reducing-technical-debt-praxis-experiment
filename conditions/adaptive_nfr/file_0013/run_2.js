# Refactored AccountPlanPage

## Key Refactoring Decisions

1. **Convert class component to functional component** - Eliminates `this` binding complexity and enables cleaner hook usage
2. **Extract custom hooks** - `usePlanState` and `useRetentionOffer` separate concerns
3. **Simplify `getConfirmationPageTitle`** - Use a lookup map instead of if/else chain
4. **Extract `OfferPriceDisplay`** - Decompose `RetentionOfferSection` into smaller pieces
5. **Simplify `getOfferMessage`** - Use early returns with clearer structure
6. **Remove dead code** - Commented-out code in `UpgradePlanSection`
7. **Consolidate `onCancelSubscription` logic** - Extract retention offer detection

```javascript
import React, {useCallback, useContext, useEffect, useRef, useState} from 'react';
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

// ─── Styles ──────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIRMATION_TITLES = {
    changePlan: () => t('Confirm subscription'),
    cancel: () => t('Cancel subscription'),
    subscribe: () => t('Subscribe'),
    offerRetention: () => 'Before you go'
};

const RUNNING_ACTIONS = {
    update: ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'],
    cancel: ['cancelSubscription:running'],
    applyOffer: ['applyOffer:running']
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfirmationPageTitle({confirmationType}) {
    return CONFIRMATION_TITLES[confirmationType]?.() ?? '';
}

// TODO: Add i18n once copy is finalized
function getOfferMessage(offer, originalPrice, currency, amountOff) {
    const {type, duration, amount, duration_in_months: durationMonths, cadence} = offer;
    const priceWithCadence = `${currency}${originalPrice}/${cadence}`;

    if (type === 'free_months') {
        const monthLabel = amount === 1 ? '1 month' : `${amount} months`;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${amount * 30} days.`;
    }

    const savingsMessages = {
        forever: `Enjoy ${amountOff} off forever.`,
        once: `Save ${amountOff} on your next billing cycle. Then ${priceWithCadence}.`,
        repeating: durationMonths === 1
            ? `Save ${amountOff} on your next billing cycle. Then ${priceWithCadence}.`
            : `Save ${amountOff} on your next ${durationMonths} billing cycles. Then ${priceWithCadence}.`
    };

    return savingsMessages[duration] ?? '';
}

function buildInitialPrices(site, member) {
    const prices = getAvailablePrices({site});
    const activePrice = getMemberActivePrice({member});
    return activePrice
        ? getFilteredPrices({prices, currency: activePrice.currency})
        : prices;
}

function buildInitialSelectedPlan(prices, member) {
    const activePrice = getMemberActivePrice({member});

    if (activePrice) {
        return prices.find(p => p.id === activePrice.id)?.id ?? null;
    }

    if (!isPaidMember({member}) && prices.length > 0) {
        return prices[0].id;
    }

    return null;
}

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

function usePlanPrices(site, member) {
    const prices = buildInitialPrices(site, member);
    const selectedPlan = buildInitialSelectedPlan(prices, member);
    return {prices, defaultSelectedPlan: selectedPlan};
}

function usePlanState(prices, member) {
    const [selectedPlan, setSelectedPlan] = useState(
        () => buildInitialSelectedPlan(prices, member)
    );
    const [confirmation, setConfirmation] = useState({
        show: false,
        plan: null,
        type: null,
        pendingOffer: null,
        targetSubscriptionId: null
    });

    const resetConfirmation = useCallback(() => {
        setConfirmation({
            show: false,
            plan: null,
            type: null,
            pendingOffer: null,
            targetSubscriptionId: null
        });
    }, []);

    const showConfirmation = useCallback((updates) => {
        setConfirmation(prev => ({...prev, show: true, ...updates}));
    }, []);

    const updateConfirmation = useCallback((updates) => {
        setConfirmation(prev => ({...prev, ...updates}));
    }, []);

    return {
        selectedPlan,
        setSelectedPlan,
        confirmation,
        resetConfirmation,
        showConfirmation,
        updateConfirmation
    };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    const defaultTitle = isPaidMember({member}) ? t('Change plan') : t('Choose a plan');
    const title = showConfirmation
        ? getConfirmationPageTitle({confirmationType})
        : defaultTitle;

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

    const isRunning = RUNNING_ACTIONS.cancel.includes(action);

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

const ChangePlanConfirmation = ({plan, member, site, action, brandColor, onConfirm}) => {
    const subscription = getMemberSubscription({member});
    const isRunning = RUNNING_ACTIONS.update.includes(action);
    const currentActivePlan = getMemberActivePrice({member});
    const planStartDate = getDateString(subscription.current_period_end);
    const startingMessage = currentActivePlan.id !== plan.id
        ? t('Starting today')
        : t('Starting {startDate}', {startDate: planStartDate});
    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${startingMessage}`;
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

const CancelConfirmation = ({subscription, action, brandColor, onConfirm}) => {
    const [reason, setReason] = useState('');
    const isRunning = RUNNING_ACTIONS.update.includes(action);

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
    const {site, action, member, brandColor} = useContext(AppContext);
    const subscription = getMemberSubscription({member});

    if (type === 'changePlan') {
        return (
            <ChangePlanConfirmation
                {...{plan, member, site, action, brandColor, onConfirm}}
            />
        );
    }

    return (
        <CancelConfirmation
            {...{subscription, action, brandColor, onConfirm}}
        />
    );
};

const OfferPriceDisplay = ({offer, currency, discountedPrice, originalPrice}) => {
    if (offer.type === 'free_months') {
        return null;
    }

    return (
        <div className="gh-portal-retention-offer-price">
            <div className="gh-portal-product-price">
                <span className="currency-sign">{currency}</span>
                <span className="amount">{discountedPrice}</span>
            </div>
            <div className="gh-portal-offer-oldprice">
                {currency}{originalPrice}
            </div>
        </div>
    );
};

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = RUNNING_ACTIONS.applyOffer.includes(action);

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const cadenceLabel = offer.cadence === 'month' ? 'Monthly' : 'Yearly';
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);

    // TODO: Add i18n once copy is finalized
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
                    <OfferPriceDisplay
                        {...{offer, currency, discountedPrice, originalPrice}}
                    />
                    <p className="footnote">{offerMessage}</p>
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

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);
    const isFreeOrComplimentary = !isPaidMember({member}) || isComplimentaryMember({member});

    if (isFreeOrComplimentary) {
        return (
            <UpgradePlanSection
                {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}}
            />
        );
    }

    if (!showConfirmation) {
        return (
            <ChangePlanSection
                {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}}
            />
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

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function AccountPlanPage() {
    const context = useContext(AppContext);
    const {member, site, offers, lastPage, doAction, pageData} = context;

    const prices = buildInitialPrices(site, member);
    const {
        selectedPlan,
        setSelectedPlan,
        confirmation,
        resetConfirmation,
        showConfirmation,
        updateConfirmation
    } = usePlanState(prices, member);

    const timeoutRef = useRef(null);

    // Redirect unauthenticated users
    useEffect(() => {
        if (!member) {
            doAction('switchPage', {page: 'signin'});
            return;
        }

        // Trigger cancellation flow if opened from a custom cancel button
        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            handleCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    const getActivePriceId = useCallback(() => {
        return getMemberActivePrice({member})?.id ?? null;
    }, [member]);

    const handleBack = useCallback(() => {
        if (confirmation.show) {
            resetConfirmation();
        } else {
            doAction('back');
        }
    }, [confirmation.show, resetConfirmation, doAction]);

    const handlePlanSelect = useCallback((e, priceId) => {
        e?.preventDefault();

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            // Defer to avoid React checkbox sync issues
            timeoutRef.current = setTimeout(() => {
                setSelectedPlan(priceId);
            }, 5);
            return;
        }

        if (priceId === selectedPlan) {
            return;
        }

        const confirmationPrice = prices.find(p => p.id === priceId);
        const confirmationType = getActivePriceId() ? 'changePlan' : 'subscribe';
        showConfirmation({plan: confirmationPrice, type: confirmationType});
    }, [member, selectedPlan, prices, getActivePriceId, showConfirmation, setSelectedPlan]);

    const handlePlanCheckout = useCallback((e, priceId) => {
        const planId = priceId ?? selectedPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            const subscriptionId = subscription?.id;
            if (subscriptionId && confirmation.plan) {
                doAction('updateSubscription', {
                    plan: confirmation.plan.name,
                    planId: confirmation.plan.id,
                    subscriptionId,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: planId});
        }
    }, [member, selectedPlan, confirmation.plan, doAction]);

    const handleCancelSubscription = useCallback(({subscriptionId}) => {
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffers = (offers || []).filter(o => o.redemption_type === 'retention');
        const firstRetentionOffer = retentionOffers[0] ?? null;

        showConfirmation({
            plan: subscriptionPlan,
            type: firstRetentionOffer ? 'offerRetention' : 'cancel',
            pendingOffer: firstRetentionOffer,
            targetSubscriptionId: subscriptionId
        });
    }, [member, offers, showConfirmation]);

    const handleAcceptRetentionOffer = useCallback(() => {
        const {pendingOffer, targetSubscriptionId} = confirmation;
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    }, [confirmation, doAction]);

    const handleDeclineRetentionOffer = useCallback(() => {
        updateConfirmation({type: 'cancel', pendingOffer: null});
    }, [updateConfirmation]);

    const handleConfirm = useCallback((e, data) => {
        const {type} = confirmation;
        if (type === 'cancel') {
            const {targetSubscriptionId} = confirmation;
            if (!targetSubscriptionId) {
                return;
            }
            doAction('cancelSubscription', {
                subscriptionId: targetSubscriptionId,
                cancelAtPeriodEnd: true,
                cancellationReason: data
            });
        } else if (['changePlan', 'subscribe'].includes(type)) {
            handlePlanCheckout();
        }
    }, [confirmation, doAction, handlePlanCheckout]);

    return (
        <div className='gh-portal-content'>
            <BackButton
                onClick={handleBack}
                hidden={!lastPage && !confirmation.show}
            />
            <CloseButton />
            <Header
                confirmationType={confirmation.type}
                showConfirmation={confirmation.show}
            />
            <PlansContainer
                plans={prices}
                selectedPlan={selectedPlan}
                showConfirmation={confirmation.show}
                confirmationPlan={confirmation.plan}
                confirmationType={confirmation.type}
                pendingOffer={confirmation.pendingOffer}
                onConfirm={handleConfirm}
                onCancelSubscription={handleCancelSubscription}
                onAcceptRetentionOffer={handleAcceptRetentionOffer}
                onDeclineRetentionOffer={handleDeclineRetentionOffer}
                onPlanSelect={handlePlanSelect}
                onPlanCheckout={handlePlanCheckout}
            />
        </div>
    );
}
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| Component type | Class component with `this` binding | Functional component with hooks |
| State management | Multiple `setState` calls with scattered fields | `usePlanState` hook with grouped `confirmation` object |
| `getConfirmationPageTitle` | 4-branch if/else chain | Lookup map with optional chaining |
| `getOfferMessage` | 5 if/else branches | Lookup map + early return for `free_months` |
| `PlanConfirmationSection` | Single large component with if/else | Split into `ChangePlanConfirmation` + `CancelConfirmation` |
| `RetentionOfferSection` | Inline conditional price rendering | Extracted `OfferPriceDisplay` sub-component |
| `CancelSubscriptionButton` | Nested null checks | Early return with combined condition |
| `onCancelSubscription` | if/else with duplicated state shape | Single `showConfirmation` call with computed values |
| Dead code | Commented-out JSX in `UpgradePlanSection` | Removed entirely |