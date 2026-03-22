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
    let updatedPrice = originalPrice;
    let originalPriceWithCurrency = formatPrice(originalPrice, currency);

    const discountConfig: Record<string, Omit<OfferDiscount, 'originalPriceWithCurrency' | 'updatedPriceWithCurrency'> & {priceModifier?: number}> = {
        percent: {
            discountColor: 'text-green',
            discountOffer: `${amount}% off`,
            priceModifier: originalPrice - (originalPrice * amount) / 100
        },
        fixed: {
            discountColor: 'text-blue',
            discountOffer: `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`,
            priceModifier: originalPrice - amount
        },
        trial: {
            discountColor: 'text-pink',
            discountOffer: `${amount} days free`
        }
    };

    const config = discountConfig[type] ?? {discountColor: '', discountOffer: ''};

    if (type === 'trial') {
        originalPriceWithCurrency = '';
    } else if (config.priceModifier !== undefined) {
        updatedPrice = Math.max(0, config.priceModifier);
    }

    return {
        discountColor: config.discountColor,
        discountOffer: config.discountOffer,
        originalPriceWithCurrency,
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

const CELL_BASE = 'p-0';
const LINK_BASE = 'block p-5';

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

const OfferTableRow: React.FC<{
    offer: ReturnType<typeof useBrowseOffers>['data']['offers'][number];
    offerTier: Tier;
    onEdit: (id: string) => void;
}> = ({offer, offerTier, onEdit}) => {
    const isTierArchived = offerTier.active === false;
    const offerId = offer.id ?? '';
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} =
        getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);

    const handleEdit = isTierArchived ? () => {} : () => onEdit(offerId);
    const linkClass = `${LINK_BASE} ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'}`;
    const cellClass = `${CELL_BASE} ${isTierArchived ? 'opacity-50' : ''}`;

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={cellClass}>
                <a className={linkClass} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>

            <td className={`${cellClass} whitespace-nowrap text-sm`}>
                <a className={linkClass} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>

            <td className={`${cellClass} whitespace-nowrap text-sm`}>
                <a className={linkClass} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>

            <td className={`${cellClass} w-[120px] whitespace-nowrap text-sm`}>
                <a
                    className={`${LINK_BASE} ${offer.redemption_count === 0 ? '' : 'hover:underline'} ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offerId) : undefined}
                    onClick={offer.redemption_count === 0 ? handleEdit : () => {}}
                >
                    {offer.redemption_count}
                </a>
            </td>

            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
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

// ─── Sorting Helpers ──────────────────────────────────────────────────────────

const sortOffers = (
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

const isOfferActive = (offer: {status: string}, tier: Tier | undefined) =>
    offer.status === 'active' && tier?.active === true;

const isOfferArchived = (offer: {status: string}, tier: Tier | undefined) =>
    offer.status === 'archived' || tier?.active === false;

// ─── Main Modal ───────────────────────────────────────────────────────────────

const OFFERS_TABS: Tab[] = [
    {id: 'active', title: 'Active'},
    {id: 'archived', title: 'Archived'}
];

const SORT_ITEMS = (sortOption: SortOption, sortDirection: SortDirection) => [
    {id: 'date-added', label: 'Date added', selected: sortOption === 'date-added', direction: sortDirection},
    {id: 'name', label: 'Name', selected: sortOption === 'name', direction: sortDirection},
    {id: 'redemptions', label: 'Redemptions', selected: sortOption === 'redemptions', direction: sortDirection}
];

export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const {sortingState, setSortingState} = useSortingState();
    const [selectedTab, setSelectedTab] = useState<'active' | 'archived'>('active');

    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');

    const getTierForOffer = (offer: {tier?: {id?: string}}) =>
        allTiers?.find(tier => tier.id === offer?.tier?.id);

    const activeOffers = signupOffers.filter(offer => isOfferActive(offer, getTierForOffer(offer)));
    const archivedOffers = signupOffers.filter(offer => isOfferArchived(offer, getTierForOffer(offer)));

    const offersSorting = sortingState?.find(s => s.type === 'offers');
    const sortOption = (offersSorting?.option ?? 'date-added') as SortOption;
    const sortDirection = (offersSorting?.direction ?? 'desc') as SortDirection;

    const sortedOffers = sortOffers(signupOffers, sortOption, sortDirection);
    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const currentTabOffers = selectedTab === 'active' ? activeOffers : archivedOffers;
    const hasOffersInTab = currentTabOffers.length > 0;

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

    const handleSortChange = (option: string) => {
        setSortingState?.([{type: 'offers', option, direction: sortDirection}]);
    };

    const handleDirectionChange = (selectedDirection: string) => {
        const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([{type: 'offers', option: sortOption, direction: newDirection}]);
    };

    const buttons: ButtonProps[] = [
        {key: 'cancel-modal', label: 'Close', onClick: handleClose},
        {key: 'new-offer', icon: 'add', label: 'New offer', color: 'green', onClick: handleNewOffer}
    ];

    const filteredSortedOffers = sortedOffers.filter((offer) => {
        const tier = getTierForOffer(offer);
        return selectedTab === 'active'
            ? isOfferActive(offer, tier)
            : isOfferArchived(offer, tier);
    });

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
            topRightContent={<ButtonGroup buttons={buttons} />}
            width={1140}
        >
            <div className='flex h-full flex-col pt-8'>
                <header>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={OFFERS_TABS}
                        topRightContent={hasOffersInTab ? (
                            <div className='pt-1'>
                                <SortMenu
                                    direction={sortDirection}
                                    items={SORT_ITEMS(sortOption, sortDirection)}
                                    position='end'
                                    triggerButtonProps={{link: true}}
                                    onDirectionChange={handleDirectionChange}
                                    onSortChange={handleSortChange}
                                />
                            </div>
                        ) : null}
                        onTabChange={tab => setSelectedTab(tab as 'active' | 'archived')}
                    />
                </header>

                {!hasOffersInTab && !isFetchingOffers && (
                    selectedTab === 'active' ? (
                        <EmptyState
                            buttonAction={() => updateRoute('offers/new')}
                            buttonLabel='Create an offer'
                            description='Grow your audience with discounts or free trials.'
                        />
                    ) : (
                        <EmptyState
                            buttonAction={() => setSelectedTab('active')}
                            buttonLabel='Back to active'
                            description='All archived offers will be shown here.'
                        />
                    )
                )}

                <div className='overflow-x-auto'>
                    <table className='m-0 w-full'>
                        {hasOffersInTab && (
                            <OfferTableHeader count={currentTabOffers.length} tab={selectedTab} />
                        )}
                        {filteredSortedOffers.map((offer) => {
                            const offerTier = getTierForOffer(offer);
                            if (!offerTier) {
                                return null;
                            }
                            return (
                                <OfferTableRow
                                    key={offer.id}
                                    offer={offer}
                                    offerTier={offerTier}
                                    onEdit={handleOfferEdit}
                                />
                            );
                        })}
                    </table>
                </div>
            </div>
        </Modal>
    );
};
```

Key improvements made:

1. **Consolidated imports** — All `@tryghost/admin-x-design-system` imports merged into a single statement.

2. **Extracted types** — Added `SortOption`, `SortDirection`, and `OfferDiscount` interfaces for clarity and reuse.

3. **Simplified utility functions** — `getOfferDuration` uses a lookup map; `formatPrice` extracted to avoid repetition; `getOfferDiscount` uses a config map instead of a `switch`.

4. **Extracted components** — `OfferTableHeader` and `OfferTableRow` extracted from the inline JSX blob, dramatically reducing the complexity of the main modal.

5. **Extracted helpers** — `sortOffers`, `isOfferActive`, and `isOfferArchived` pulled out as pure functions, making them independently testable.

6. **Extracted event handlers** — `handleClose`, `handleNewOffer`, `handleSortChange`, `handleDirectionChange` are named functions instead of inline lambdas.

7. **Eliminated duplication** — `getTierForOffer`, `currentTabOffers`, and `hasOffersInTab` computed once and reused throughout.

8. **Constants hoisted** — `OFFERS_TABS` and `SORT_ITEMS` moved outside the component to avoid recreation on every render.