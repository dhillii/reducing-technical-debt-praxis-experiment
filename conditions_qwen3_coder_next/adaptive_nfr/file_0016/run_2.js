function ProductCardButton({selectedProduct, product, disabled, noOfProducts, trialDays}) {
    if (selectedProduct === product.id && disabled) {
        return <LoaderIcon className='gh-portal-loadingicon' />;
    }
    if (trialDays > 0) {
        return (
            <Interpolate
                string={t('Start {amount}-day free trial')}
                mapping={{amount: trialDays}}
            />
        );
    }
    return noOfProducts > 1 ? t('Choose') : t('Continue');
}

function ProductCardPaymentDetails({product, selectedInterval, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const {action} = useContext(AppContext);
    const trialDays = product.trial_days;
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const noOfProducts = product.__parentProducts?.filter((d) => d.type === 'paid')?.length || 0;

    let disabled = (['signup:running', 'checkoutPlan:running'].includes(action)) ? true : false;
    if (isCookiesDisabled()) {
        disabled = true;
    }

    let productDescription = product.description;
    if (!product.benefits?.length && !productDescription) {
        productDescription = 'Full access';
    }

    function handleSelect(e) {
        e.stopPropagation();
        setSelectedProduct(product.id);
    }

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={handleSelect}
            data-test-tier="paid"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    <div className="gh-portal-product-description" data-testid="product-description">
                        {productDescription}
                    </div>
                    <ProductBenefitsContainer product={product} />
                </div>
                <div className='gh-portal-btn-product'>
                    <button
                        data-test-button='select-tier'
                        disabled={disabled}
                        className='gh-portal-btn'
                        onClick={(e) => {
                            const selectedPrice = getSelectedPrice({
                                products: product.__parentProducts,
                                selectedInterval,
                                selectedProduct: product.id
                            });
                            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactored to reduce depth
                            if (selectedPrice?.id) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                            if (e.target.tagName !== 'BUTTON') {
                                return;
                            }
                            product.__handleChooseSignup(e, selectedPrice?.id);
                        }}
                    >
                        <ProductCardButton
                            selectedProduct={selectedProduct}
                            product={product}
                            disabled={disabled}
                            noOfProducts={noOfProducts}
                            trialDays={trialDays}
                        />
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}