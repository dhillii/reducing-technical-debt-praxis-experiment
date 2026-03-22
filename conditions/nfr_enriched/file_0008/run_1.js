Here's the refactored code with improved organization, reduced complexity, and better separation of concerns:

```typescript
import {
    Button,
    ButtonGroup,
    Icon,
    Modal,
    SortMenu,
    TabView,
    Tooltip,
    type ButtonProps,
    type Tab,
    showToast
} from '@tryghost/admin-x-design-system';
import {type Tier, getPaidActiveTiers, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {numberWithCommas} from '../../../../utils/helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OfferType = 'percent' | 'fixed' | 'trial';

type SortOption = 'date-added' | 'name' | 'redemptions';
type SortDirection = 'asc' | 'desc';

interface OfferDiscount {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export const createRedemptionFilterUrl = (id: string): string => {
    const filterValue = `offer_redemptions:[${id}]`;
    return `/ghost/#/members?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string =>
    cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string => {
    const durationMap: Record<string, string> = {
        once: 'First payment',
        repeating: 'Repeating',
        forever: 'Forever'
    };
    return durationMap[duration] ?? duration;
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

const formatPrice = (amount: number, currency: string): string =>
    getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)));

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): OfferDiscount => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    const originalPriceFormatted = formatPrice(originalPrice, currency);

    const discountConfig: Record<string, Omit<OfferDiscount, 'updatedPriceWithCurrency'> & {priceAdjustment: number}> = {
        percent: {
            discountColor: 'text-green',
            discountOffer: `${amount}% off`,
            originalPriceWithCurrency: originalPriceFormatted,
            priceAdjustment: (originalPrice * amount) / 100
        },
        fixed: {
            discountColor: 'text-blue',
            discountOffer: `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`,
            originalPriceWithCurrency: originalPriceFormatted,
            priceAdjustment: amount
        },
        trial: {
            discountColor: 'text-pink',
            discountOffer: `${amount} days free`,
            originalPriceWithCurrency: '',
            priceAdjustment: 0
        }
    };

    const config = discountConfig[type] ?? {
        discountColor: '',
        discountOffer: '',
        originalPriceWithCurrency: originalPriceFormatted,
        priceAdjustment: 0
    };

    const {priceAdjustment, ...discount} = config;
    const updatedPrice = Math.max(0, originalPrice - priceAdjustment);

    return {
        ...discount,
        updatedPriceWithCurrency: formatPrice(updatedPrice, currency)
    };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent<HTMLElement, MouseEvent>) => {
        e?.stopPropagation();
        navigator.clipboard.writeText(`${getHomepageUrl(siteData!)}${offerCode}`);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <Tooltip
            containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center leading-none w-5 h-5'
            content={isCopied ? 'Copied' : 'Copy link'}
            size='sm'
        >
            <Button
                color='clear'
                hideLabel={true}
                icon={isCopied ? 'check-circle' : 'hyperlink-circle'}
                iconColorClass={isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]'}
                label={isCopied ? 'Copied' : 'Copy'}
                unstyled={true}
                onClick={handleCopyClick}
            />
        </Tooltip>
    );
};

export const EmptyState: React.FC<{
    title?: string;
    description: string;
    buttonAction: () => void;
    buttonLabel: string;
}> = ({title = 'No offers found', description, buttonAction, buttonLabel}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='xl' />
        <h1 className='mt-6 text-2xl'>{title}</h1>
        <p className='mt-3 max-w-[420px] text-[1.6rem]'>{description}</p>
        <Button className='mt-8' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

// ─── Offer Table ──────────────────────────────────────────────────────────────

const OfferTableHeader: React.FC<{count: number; tab: string}> = ({count, tab}) => (
    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>
            {count} {count !== 1 ? 'offers' : 'offer'}
        </th>
        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700' />
    </tr>
);

interface OfferRowProps {
    offer: ReturnType<typeof useBrowseOffers>['data']['offers'][number];
    tier: Tier;
    onEdit: (id: string) => void;
}

const OfferRow: React.FC<OfferRowProps> = ({offer, tier, onEdit}) => {
    const isTierArchived = tier.active === false;
    const offerId = offer.id ?? '';
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} =
        getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', tier);

    const cellClass = isTierArchived ? 'opacity-50' : '';
    const linkClass = `block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'}`;
    const handleEdit = !isTierArchived ? () => onEdit(offerId) : () => {};

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={`${cellClass} p-0`}>
                <a className={`${linkClass} p-5 pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{tier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>

            <td className={`${cellClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`${linkClass} p-5`} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>

            <td className={`${cellClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`${linkClass} p-5`} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>

            <td className={`${cellClass} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`${linkClass} p-5 ${offer.redemption_count > 0 ? 'hover:underline' : ''}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offerId) : undefined}
                    onClick={offer.redemption_count === 0 ? handleEdit : () => {}}
                >
                    {offer.redemption_count}
                </a>
            </td>

            <td className={`${cellClass} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>

            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useOffersSorting = () => {
    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');

    const sortOption = (offersSorting?.option ?? 'date-added') as SortOption;
    const sortDirection = (offersSorting?.direction ?? 'desc') as SortDirection;

    const updateSort = (option: SortOption, direction: SortDirection) => {
        setSortingState?.([{type: 'offers', option, direction}]);
    };

    return {sortOption, sortDirection, updateSort};
};

const useSortedOffers = (
    offers: ReturnType<typeof useBrowseOffers>['data']['offers'],
    sortOption: SortOption,
    sortDirection: SortDirection
) => {
    const multiplier = sortDirection === 'desc' ? -1 : 1;

    return [...offers].sort((a, b) => {
        switch (sortOption) {
        case 'name':
            return multiplier * a.name.localeCompare(b.name);
        case 'redemptions':
            return multiplier * (a.redemption_count - b.redemption_count);
        default:
            return multiplier * (
                (a.created_at ? new Date(a.created_at).getTime() : 0) -
                (b.created_at ? new Date(b.created_at).getTime() : 0)
            );
        }
    });
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

const OFFERS_TABS: Tab[] = [
    {id: 'active', title: 'Active'},
    {id: 'archived', title: 'Archived'}
];

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const [selectedTab, setSelectedTab] = useState('active');
    const {sortOption, sortDirection, updateSort} = useOffersSorting();

    const signupOffers = allOffers.filter(o => o.redemption_type === 'signup');

    const isOfferActive = (offer: typeof signupOffers[number]) => {
        const tier = allTiers?.find(t => t.id === offer?.tier?.id);
        return offer.status === 'active' && tier?.active === true;
    };

    const isOfferArchived = (offer: typeof signupOffers[number]) => !isOfferActive(offer);

    const activeOffers = signupOffers.filter(isOfferActive);
    const archivedOffers = signupOffers.filter(isOfferArchived);
    const sortedOffers = useSortedOffers(signupOffers, sortOption, sortDirection);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const handleClose = () => {
        modal.remove();
        updateRoute('offers');
    };

    const handleNewOffer = () => {
        if (paidActiveTiers.length === 0) {
            showToast({type: 'info', title: 'You must have an active tier to create an offer.'});
        } else {
            updateRoute('offers/new');
        }
    };

    const currentTabOffers = selectedTab === 'active' ? activeOffers : archivedOffers;
    const hasOffers = currentTabOffers.length > 0;

    const visibleOffers = sortedOffers.filter(offer =>
        selectedTab === 'active' ? isOfferActive(offer) : isOfferArchived(offer)
    );

    const modalButtons: ButtonProps[] = [
        {key: 'cancel-modal', label: 'Close', onClick: handleClose},
        {key: 'new-offer', icon: 'add', label: 'New offer', color: 'green', onClick: handleNewOffer}
    ];

    const sortMenuItems = (['date-added', 'name', 'redemptions'] as const).map(id => ({
        id,
        label: id === 'date-added' ? 'Date added' : id.charAt(0).toUpperCase() + id.slice(1),
        selected: sortOption === id,
        direction: sortDirection
    }));

    return (
        <Modal
            afterClose={() => updateRoute('offers')}
            animate={false}
            backDropClick={false}
            cancelLabel=''
            footer={false}
            height='full'
            size='lg'
            testId='offers-modal'
            title='Offers'
            topRightContent={<ButtonGroup buttons={modalButtons} />}
            width={1140}
        >
            <div className='flex h-full flex-col pt-8'>
                <header>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={OFFERS_TABS}
                        topRightContent={hasOffers ? (
                            <div className='pt-1'>
                                <SortMenu
                                    direction={sortDirection}
                                    items={sortMenuItems}
                                    position='end'
                                    triggerButtonProps={{link: true}}
                                    onDirectionChange={dir =>
                                        updateSort(sortOption, dir === 'asc' ? 'desc' : 'asc')
                                    }
                                    onSortChange={option =>
                                        updateSort(option as SortOption, sortDirection)
                                    }
                                />
                            </div>
                        ) : null}
                        onTabChange={setSelectedTab}
                    />
                </header>

                {!hasOffers && !isFetchingOffers && selectedTab === 'active' && (
                    <EmptyState
                        buttonAction={() => updateRoute('offers/new')}
                        buttonLabel='Create an offer'
                        description='Grow your audience with discounts or free trials.'
                    />
                )}

                {!hasOffers && !isFetchingOffers && selectedTab === 'archived' && (
                    <EmptyState
                        buttonAction={() => setSelectedTab('active')}
                        buttonLabel='Back to active'
                        description='All archived offers will be shown here.'
                    />
                )}

                <div className='overflow-x-auto'>
                    <table className='m-0 w-full'>
                        {hasOffers && <OfferTableHeader count={currentTabOffers.length} tab={selectedTab} />}
                        {visibleOffers.map((offer) => {
                            const tier = allTiers?.find(t => t.id === offer?.tier?.id);
                            return tier ? (
                                <OfferRow
                                    key={offer.id}
                                    offer={offer}
                                    tier={tier}
                                    onEdit={handleOfferEdit}
                                />
                            ) : null;
                        })}
                    </table>
                </div>
            </div>
        </Modal>
    );
};
```

Key improvements made:

1. **Consolidated imports** — All `@tryghost/admin-x-design-system` imports merged into one statement.

2. **Extracted types** — Added `SortOption`, `SortDirection`, and `OfferDiscount` interfaces for clarity.

3. **Simplified `getOfferDiscount`** — Replaced the `switch` with a config map and extracted `formatPrice` and `formatToTwoDecimals` as standalone helpers.

4. **Extracted `OfferTableHeader`** — Pulled the table header row into its own component, removing inline count/pluralization logic.

5. **Extracted `OfferRow`** — The most impactful extraction; the large inline `map` callback became a focused, readable component with named variables for repeated class logic.

6. **Extracted `useOffersSorting` hook** — Encapsulates sorting state read/write logic.

7. **Extracted `useSortedOffers` hook** — Isolates sort logic and avoids mutating the original array with a spread copy.

8. **Simplified offer filtering** — `isOfferActive`/`isOfferArchived` predicates replace duplicated inline filter logic.

9. **Moved `OFFERS_TABS` to a constant** — Avoids re-creating the array on every render.

10. **Derived `sortMenuItems`** — Replaced repetitive object literals with a mapped array.