# Refactored AccountPlanPage

Here's the refactored code with improved quality and reduced complexity:

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
    .gh-portal-accountplans-main { margin-top: 24px; margin-bottom: 0; }
    .gh-portal-expire-container { margin: 32px 0 0; }
    .gh-portal-cancellation-form p { margin-bottom: 12px; }
    .gh-portal-cancellation-form .gh-portal-input-section { margin-bottom: 20px; }
    .gh-portal-cancellation-form .gh-portal-input { resize: none; width: 100%; height: 62px; padding: 6px 12px; }
    .gh-portal-retention-offer-price { display: flex; align-items: center; gap: 6px; margin-top: 20px; }
    .gh-portal-retention-offer-price .gh-portal-offer-oldprice { margin: 4px 0 0; }
`;

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIRMATION_TITLES = {
    changePlan: () => t('Confirm subscription'),
    cancel: () => t('Cancel subscription'),
    subscribe: () => t('Subscribe'),
    offerRetention: () => 'Before you go'
};

const RUNNING_ACTIONS = {
    cancel: ['cancelSubscription:running'],
    update: ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running']
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getConfirmationPageTitle({confirmationType}) {
    return CONFIRMATION_TITLES[confirmationType]?.() ?? '';
}

function getOfferMessage(offer, originalPrice, currency, amountOff) {
    const {type, duration, duration_in_months: durationMonths, amount, cadence} = offer;
    const priceStr = `${currency}${originalPrice}/${cadence}`;

    if (type === 'free_months') {
        const monthLabel = amount === 1 ? '1 month' : `${amount} months`;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${amount * 30} days.`;
    }

    const durationMessages = {
        forever: `Enjoy ${amountOff} off forever.`,
        once: `Save ${amountOff} on your next billing cycle. Then ${priceStr}.`,
        repeating: durationMonths === 1
            ? `Save ${amountOff} on your next billing cycle. Then ${priceStr}.`
            : `Save ${amountOff} on your next ${durationMonths} billing cycles. Then ${priceStr}.`
    };

    return durationMessages[duration] ?? '';
}

function buildInitialPriceState({member, site}) {
    const prices = getAvailablePrices({site});
    const activePrice = getMemberActivePrice({member});
    const filteredPrices = activePrice
        ? getFilteredPrices({prices, currency: activePrice.currency})
        : prices;

    const selectedPrice = activePrice
        ? filteredPrices.find(p => p.id === activePrice.id)
        : (!isPaidMember({member}) && filteredPrices.length > 0 ? filteredPrices[0] : null);

    return {prices: filteredPrices, selectedPriceId: selectedPrice?.id ?? null};
}

// ─── Small Components ─────────────────────────────────────────────────────────

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

    const isRunning = RUNNING_ACTIONS.cancel.includes(action);

    return (
        <div className='gh-portal-expire-container'>
            <ActionButton
                dataTestId='cancel-subscription'
                onClick={() => onCancelSubscription({subscriptionId: subscription.id, cancelAtPeriodEnd: true})}
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

// ─── Plan Confirmation ────────────────────────────────────────────────────────

const ChangePlanConfirmation = ({plan, onConfirm, member, site, action, brandColor}) => {
    const isRunning = RUNNING_ACTIONS.update.includes(action);
    const subscription = getMemberSubscription({member});
    const currentActivePlan = getMemberActivePrice({member});
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');

    const planStartDate = getDateString(subscription.current_period_end);
    const startingMessage = currentActivePlan.id !== plan.id ? t('Starting today') : t('Starting {startDate}', {startDate: planStartDate});
    const planStartMessage = `${plan.currency_symbol}${formatNumber(plan.price)}/${t(plan.interval)} – ${startingMessage}`;

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

const CancelConfirmation = ({onConfirm, member, action, brandColor}) => {
    const [reason, setReason] = useState('');
    const isRunning = RUNNING_ACTIONS.update.includes(action);
    const subscription = getMemberSubscription({member});

    return (
        <div className='gh-portal-logged-out-form-container gh-portal-cancellation-form'>
            <p>
                <Interpolate
                    string={t('If you cancel your subscription now, you will continue to have access until {periodEnd}.')}
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
                    rows='2'
                    maxLength='500'
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
    const sharedProps = {onConfirm, member, action, brandColor};

    return type === 'changePlan'
        ? <ChangePlanConfirmation {...sharedProps} plan={plan} site={site} />
        : <CancelConfirmation {...sharedProps} />;
};

// ─── Retention Offer ──────────────────────────────────────────────────────────

const RetentionOfferPriceDisplay = ({offer, currency, discountedPrice, originalPrice}) => {
    if (offer.type === 'free_months') {
        return null;
    }
    return (
        <div className='gh-portal-retention-offer-price'>
            <div className='gh-portal-product-price'>
                <span className='currency-sign'>{currency}</span>
                <span className='amount'>{discountedPrice}</span>
            </div>
            <div className='gh-portal-offer-oldprice'>{currency}{originalPrice}</div>
        </div>
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
        <div className='gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer'>
            <p className='gh-portal-text-center'>
                {'We\'d hate to see you go! How about a special offer to stay?'}
            </p>
            <div className='gh-portal-offer-bar'>
                <div className='gh-portal-offer-title'>
                    <h4>{product.name} - {cadenceLabel}</h4>
                    <h5 className='gh-portal-discount-label'>{discountText}</h5>
                </div>
                <div className='gh-portal-offer-details'>
                    <RetentionOfferPriceDisplay {...{offer, currency, discountedPrice, originalPrice}} />
                    <p className='footnote'>
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
                    label='Accept offer'
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
                label='No thanks, I want to cancel'
                style={{width: '100%', marginTop: '32px', marginBottom: '24px'}}
            />
        </div>
    );
};

// ─── Plans Sections ───────────────────────────────────────────────────────────

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

// ─── Plans Container ──────────────────────────────────────────────────────────

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType,
    showConfirmation = false, pendingOffer,
    onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);
    const isFreeMember = !isPaidMember({member}) || isComplimentaryMember({member});

    if (isFreeMember) {
        return <UpgradePlanSection {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}} />;
    }

    if (!showConfirmation) {
        return <ChangePlanSection {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}} />;
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

    return <PlanConfirmationSection plan={confirmationPlan} type={confirmationType} onConfirm={onConfirm} />;
};

// ─── Main Page (converted to functional component) ────────────────────────────

const INITIAL_CONFIRMATION_STATE = {
    showConfirmation: false,
    confirmationPlan: null,
    confirmationType: null,
    pendingOffer: null,
    targetSubscriptionId: null
};

export default function AccountPlanPage() {
    const context = useContext(AppContext);
    const {member, site, offers, lastPage, pageData, doAction} = context;
    const timeoutRef = useRef(null);

    const {prices, selectedPriceId} = buildInitialPriceState({member, site});
    const [selectedPlan, setSelectedPlan] = useState(selectedPriceId);
    const [confirmationState, setConfirmationState] = useState(INITIAL_CONFIRMATION_STATE);

    const {showConfirmation, confirmationPlan, confirmationType, pendingOffer, targetSubscriptionId} = confirmationState;

    const resetConfirmation = useCallback(() => {
        setConfirmationState(INITIAL_CONFIRMATION_STATE);
    }, []);

    const getActivePriceId = useCallback(() => {
        return getMemberActivePrice({member})?.id ?? null;
    }, [member]);

    // ── Cancel subscription flow ──────────────────────────────────────────────

    const onCancelSubscription = useCallback(({subscriptionId}) => {
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffer = (offers || []).find(o => o.redemption_type === 'retention');

        setConfirmationState({
            showConfirmation: true,
            confirmationPlan: subscriptionPlan,
            confirmationType: retentionOffer ? 'offerRetention' : 'cancel',
            pendingOffer: retentionOffer ?? null,
            targetSubscriptionId: subscriptionId
        });
    }, [member, offers]);

    // ── Retention offer handlers ──────────────────────────────────────────────

    const onAcceptRetentionOffer = useCallback(() => {
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    }, [doAction, pendingOffer, targetSubscriptionId]);

    const onDeclineRetentionOffer = useCallback(() => {
        setConfirmationState(prev => ({...prev, confirmationType: 'cancel', pendingOffer: null}));
    }, []);

    // ── Plan selection ────────────────────────────────────────────────────────

    const onPlanSelect = useCallback((e, priceId) => {
        e?.preventDefault();

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            timeoutRef.current = setTimeout(() => setSelectedPlan(priceId), 5);
            return;
        }

        if (priceId === selectedPlan) {
            return;
        }

        const confirmationPrice = prices.find(p => p.id === priceId);
        const activePlan = getActivePriceId();
        setConfirmationState(prev => ({
            ...prev,
            confirmationPlan: confirmationPrice,
            confirmationType: activePlan ? 'changePlan' : 'subscribe',
            showConfirmation: true
        }));
    }, [member, prices, selectedPlan, getActivePriceId]);

    // ── Plan checkout ─────────────────────────────────────────────────────────

    const onPlanCheckout = useCallback((e, priceId) => {
        const resolvedPlan = priceId ?? selectedPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            if (subscription?.id) {
                doAction('updateSubscription', {
                    plan: confirmationPlan.name,
                    planId: confirmationPlan.id,
                    subscriptionId: subscription.id,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: resolvedPlan});
        }
    }, [confirmationPlan, doAction, member, selectedPlan]);

    // ── Confirm handler ───────────────────────────────────────────────────────

    const onConfirm = useCallback((e, data) => {
        if (confirmationType === 'cancel') {
            if (!targetSubscriptionId) {
                return;
            }
            doAction('cancelSubscription', {
                subscriptionId: targetSubscriptionId,
                cancelAtPeriodEnd: true,
                cancellationReason: data
            });
        } else if (['changePlan', 'subscribe'].includes(confirmationType)) {
            onPlanCheckout();
        }
    }, [confirmationType, doAction, onPlanCheckout, targetSubscriptionId]);

    // ── Back navigation ───────────────────────────────────────────────────────

    const onBack = useCallback(() => {
        if (showConfirmation) {
            resetConfirmation();
        } else {
            doAction('back');
        }
    }, [doAction, resetConfirmation, showConfirmation]);

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!member) {
            doAction('switchPage', {page: 'signin'});
            return;
        }

        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            onCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className='gh-portal-content'>
            <BackButton onClick={onBack} hidden={!lastPage && !showConfirmation} />
            <CloseButton />
            <Header showConfirmation={showConfirmation} confirmationType={confirmationType} />
            <PlansContainer
                plans={prices}
                selectedPlan={selectedPlan}
                showConfirmation={showConfirmation}
                confirmationPlan={confirmationPlan}
                confirmationType={confirmationType}
                pendingOffer={pendingOffer}
                onConfirm={onConfirm}
                onCancelSubscription={onCancelSubscription}
                onAcceptRetentionOffer={onAcceptRetentionOffer}
                onDeclineRetentionOffer={onDeclineRetentionOffer}
                onPlanSelect={onPlanSelect}
                onPlanCheckout={onPlanCheckout}
            />
        </div>
    );
}
```

## Key Refactoring Changes

### Structural
- **Converted class component to functional component** — eliminates `this` binding issues, simplifies lifecycle management, and enables hooks
- **Extracted `ChangePlanConfirmation` and `CancelConfirmation`** from the monolithic `PlanConfirmationSection`, applying the Single Responsibility Principle
- **Extracted `RetentionOfferPriceDisplay`** from `RetentionOfferSection` to isolate conditional rendering logic

### State Management
- **Grouped related confirmation state** into a single `confirmationState` object with a shared reset function (`INITIAL_CONFIRMATION_STATE`), reducing scattered `setState` calls
- **Replaced `this.prices` instance variable** with a pure `buildInitialPriceState` helper that returns derived values cleanly

### Complexity Reduction
- **Replaced chained `if/else` in `getConfirmationPageTitle`** with a lookup map (`CONFIRMATION_TITLES`)
- **Replaced chained `if` in `getOfferMessage`** with a `durationMessages` lookup object
- **Centralized running-action arrays** in `RUNNING_ACTIONS` constant to avoid duplication
- **Simplified guard clauses** (e.g., `CancelSubscriptionButton` now uses a single combined early return)
- **Replaced `retentionOffers[0]` with `.find()`** to express intent more clearly

### Hooks & Performance
- **Used `useCallback`** on all handlers to stabilize references and document dependencies explicitly
- **Replaced `this.timeoutId`** with `useRef` for the debounce timeout, properly cleaned up in a `useEffect`