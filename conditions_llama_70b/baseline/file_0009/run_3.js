export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');
    const [selectedTab, setSelectedTab] = useState('active');
    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const getFilteredOffers = (offers: any[], tab: string) => {
        const offerTier = allTiers?.find(tier => tier.id === offers?.tier?.id);
        return tab === 'active' ? offers.filter((offer) => offer.status === 'active' && offerTier && offerTier.active === true) : offers.filter((offer) => offer.status === 'archived' || (offerTier && offerTier.active === false));
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

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const getOfferDiscount = (type: string, amount: number, cadence: string, currency: string, tier: any) => {
        let discountColor = '';
        let discountOffer = '';
        const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
        let updatedPrice = originalPrice;

        switch (type) {
            case 'percent':
                discountColor = 'text-green';
                discountOffer = amount + '% off';
                updatedPrice = originalPrice - ((originalPrice * amount) / 100);
                break;
            case 'fixed':
                discountColor = 'text-blue';
                discountOffer = amount + ' ' + currency + ' off';
                updatedPrice = originalPrice - amount;
                break;
            case 'trial':
                discountColor = 'text-pink';
                discountOffer = amount + ' days free';
                originalPrice = 0;
                break;
            default:
                break;
        };

        if (updatedPrice < 0) {
            updatedPrice = 0;
        }

        return {
            discountColor,
            discountOffer,
            originalPriceWithCurrency: getSymbol(currency) + numberWithCommas(parseFloat(originalPrice.toFixed(2))),
            updatedPriceWithCurrency: getSymbol(currency) + numberWithCommas(parseFloat(updatedPrice.toFixed(2)))
        };
    };

    const getOfferRow = (offer: any) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        if (!offerTier) {
            return null;
        }

        const isTierArchived = offerTier?.active === false;

        const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);

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

    const getTableContent = () => {
        const filteredOffers = getFilteredOffers(allOffers.filter(offer => offer.redemption_type === 'signup'), selectedTab);
        const sortedOffers = getSortedOffers(filteredOffers);

        return (
            <table className='m-0 w-full'>
                {filteredOffers.length > 0 ?
                    <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                        <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{filteredOffers.length} {filteredOffers.length !== 1 ? 'offers' : 'offer'}</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                        <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                        <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                    </tr> :
                    null
                }
                {sortedOffers.map((offer) => getOfferRow(offer))}
            </table>
        );
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
        {
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green',
            onClick: () => {
                if (paidActiveTiers.length === 0) {
                    showToast({
                        type: 'info',
                        title: 'You must have an active tier to create an offer.'
                    });
                } else {
                    updateRoute('offers/new');
                }
            }
        }
    ];

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
                        {id: 'active', title: 'Active'},
                        {id: 'archived', title: 'Archived'}
                    ]}
                    topRightContent={
                        getFilteredOffers(allOffers.filter(offer => offer.redemption_type === 'signup'), selectedTab).length > 0 ?
                            <div className='pt-1'>
                                <SortMenu
                                    direction={sortDirection as 'asc' | 'desc'}
                                    items={[
                                        {id: 'date-added', label: 'Date added', selected: sortOption === 'date-added', direction: sortDirection as 'asc' | 'desc'},
                                        {id: 'name', label: 'Name', selected: sortOption === 'name', direction: sortDirection as 'asc' | 'desc'},
                                        {id: 'redemptions', label: 'Redemptions', selected: sortOption === 'redemptions', direction: sortDirection as 'asc' | 'desc'}
                                    ]}
                                    position='end'
                                    triggerButtonProps={{
                                        link: true
                                    }}
                                    onDirectionChange={(selectedDirection) => {
                                        const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
                                        setSortingState?.([{
                                            type: 'offers',
                                            option: sortOption,
                                            direction: newDirection
                                        }]);
                                    }}
                                    onSortChange={(selectedOption) => {
                                        setSortingState?.([{
                                            type: 'offers',
                                            option: selectedOption,
                                            direction: sortDirection
                                        }]);
                                    }}
                                />
                            </div> :
                            null
                    }
                    onTabChange={setSelectedTab}
                />
            </header>
            {selectedTab === 'active' && getFilteredOffers(allOffers.filter(offer => offer.redemption_type === 'signup'), selectedTab).length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                /> :
                null
            }
            {selectedTab === 'archived' && getFilteredOffers(allOffers.filter(offer => offer.redemption_type === 'signup'), selectedTab).length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => setSelectedTab('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                /> :
                null
            }
            <div className='overflow-x-auto'>
                {getTableContent()}
            </div>
        </div>
    </Modal>;
};