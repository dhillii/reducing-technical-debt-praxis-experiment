const OffersIndexModal = () => {
    const modal = useModal();
    const { updateRoute } = useRouting();
    const { data: { offers: allOffers = [] } = {}, isFetching: isFetchingOffers } = useBrowseOffers();
    const { data: { tiers: allTiers } = {} } = useBrowseTiers();
    const { sortingState, setSortingState } = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');
    const [selectedTab, setSelectedTab] = useState('signup');
    const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const getSortedOffers = (offers: any[]) => {
        return offers.sort((offer1, offer2) => {
            const multiplier = sortDirection === 'desc' ? -1 : 1;
            switch (sortOption) {
                case 'name':
                    return multiplier * offer1.name.localeCompare(offer2.name);
                case 'redemptions':
                    return multiplier * (offer1.redemption_count - offer2.redemption_count);
                default:
                    return multiplier * ((offer1.created_at ? new Date(offer1.created_at).getTime() : 0) - (offer2.created_at ? new Date(offer2.created_at).getTime() : 0));
            }
        });
    };

    const getFilteredOffers = (sortedOffers: any[]) => {
        return sortedOffers.filter((offer) => {
            const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
            return (statusFilter === 'active' && (offer.status === 'active' && offerTier && offerTier.active === true)) ||
                (statusFilter === 'archived' && (offer.status === 'archived' || (offerTier && offerTier.active === false)));
        });
    };

    const getOfferTier = (offer: any) => {
        return allTiers?.find(tier => tier.id === offer?.tier?.id);
    };

    const getOfferDiscount = (offer: any) => {
        const offerTier = getOfferTier(offer);
        if (!offerTier) return null;
        return getOfferDiscountHelper(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);
    };

    const getOfferDiscountHelper = (type: string, amount: number, cadence: string, currency: string, tier: Tier | undefined) => {
        let discountColor = '';
        let discountOffer = '';
        const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
        let updatedPrice = originalPrice;

        const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

        let originalPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(originalPrice)));

        switch (type) {
            case 'percent':
                discountColor = 'text-green';
                discountOffer = amount + '% off';
                updatedPrice = originalPrice - ((originalPrice * amount) / 100);
                break;
            case 'fixed':
                discountColor = 'text-blue';
                discountOffer = numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount))) + ' ' + currency + ' off';
                updatedPrice = originalPrice - amount;
                break;
            case 'trial':
                discountColor = 'text-pink';
                discountOffer = amount + ' days free';
                originalPriceWithCurrency = '';
                break;
            default:
                break;
        };

        if (updatedPrice < 0) {
            updatedPrice = 0;
        }

        const updatedPriceWithCurrency = getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(updatedPrice)));

        return {
            discountColor,
            discountOffer,
            originalPriceWithCurrency,
            updatedPriceWithCurrency
        };
    };

    const getOfferRow = (offer: any) => {
        const offerTier = getOfferTier(offer);
        if (!offerTier) return null;

        const isTierArchived = offerTier?.active === false;

        const { discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency } = getOfferDiscount(offer);

        return (
            <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
                <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}><a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}><span className='font-semibold'>{offer?.name}</span><br /><span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span></a></td>
                <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}><a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}><span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span><br /><span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span></a></td>
                <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}><a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}><span className='font-medium'>{updatedPriceWithCurrency}</span> {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span> : null}</a></td>
                <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}><a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`} href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ? offer.id : '') : undefined} onClick={offer.redemption_count === 0 ? !isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {} : () => {}}>{offer.redemption_count}</a></td>
                <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>{!isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null}</td>
                {isTierArchived ?
                    <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>This offer is disabled, because <br /> it is tied to an archived tier.</div> :
                    null
                }
            </tr>
        );
    };

    const handleSortChange = (selectedOption: string) => {
        setSortingState?.([{
            type: 'offers',
            option: selectedOption,
            direction: sortDirection
        }]);
    };

    const handleDirectionChange = () => {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([{
            type: 'offers',
            option: sortOption,
            direction: newDirection
        }]);
    };

    const buttons: ButtonProps[] = [
        {
            key: 'cancel-modal',
            label: 'Close',
            onClick: () => {
                modal.remove();
                updateRoute('offers');
            }
        },
        ...(selectedTab === 'signup' ? [{
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green' as const,
            onClick: () => {
                if (getPaidActiveTiers(allTiers || []).length === 0) {
                    showToast({
                        type: 'info',
                        title: 'You must have an active tier to create an offer.'
                    });
                } else {
                    updateRoute('offers/new');
                }
            }
        }] : [])
    ];

    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const sortedOffers = getSortedOffers(signupOffers);
    const filteredOffers = getFilteredOffers(sortedOffers);

    return <Modal
        afterClose={() => {
            updateRoute('offers');
        }}
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
                    tabs={[
                        { id: 'signup', title: 'Signup' },
                        { id: 'retention', title: 'Retention' }
                    ]}
                    topRightContent={
                        selectedTab === 'signup' && filteredOffers.length > 0 ?
                            <div className='flex items-center'>
                                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
                                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Price</span>
                                <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
                                <span className='flex w-[80px] items-center justify-end'>
                                    <OffersFilterPopover
                                        setStatusFilter={setStatusFilter}
                                        sortDirection={sortDirection}
                                        sortOption={sortOption}
                                        statusFilter={statusFilter}
                                        onDirectionChange={handleDirectionChange}
                                        onSortChange={handleSortChange}
                                    />
                                </span>
                            </div> :
                            selectedTab === 'signup' ?
                                <div className='flex items-center'>
                                    <OffersFilterPopover
                                        setStatusFilter={setStatusFilter}
                                        sortDirection={sortDirection}
                                        sortOption={sortOption}
                                        statusFilter={statusFilter}
                                        onDirectionChange={handleDirectionChange}
                                        onSortChange={handleSortChange}
                                    />
                                </div> :
                                selectedTab === 'retention' ?
                                    <div className='flex items-center pt-[3px]'>
                                        <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
                                        <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
                                        <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Status</span>
                                        <span className='w-[80px]'></span>
                                    </div> :
                                    null
                    }
                    onTabChange={(tab) => {
                        setSelectedTab(tab);
                        updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
                    }}
                />
            </header>
            {selectedTab === 'signup' && statusFilter === 'active' && filteredOffers.length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                /> :
                null
            }
            {selectedTab === 'signup' && statusFilter === 'archived' && filteredOffers.length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => setStatusFilter('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                /> :
                null
            }
            {selectedTab === 'retention' && <OffersRetention />}
            {selectedTab === 'signup' && <div className='overflow-x-auto'>
                <table className='m-0 w-full table-fixed'>
                    <colgroup>
                        <col />
                        <col className='w-[220px]' />
                        <col className='w-[220px]' />
                        <col className='w-[220px]' />
                        <col className='w-[80px]' />
                    </colgroup>
                    {filteredOffers.map((offer) => getOfferRow(offer))}
                </table>
            </div>}
        </div>
    </Modal>;
};

export default OffersIndexModal;