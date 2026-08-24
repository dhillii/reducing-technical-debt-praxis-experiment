handleSignup(e) {
    e.preventDefault();
    const {pageData: offer, site} = this.context;
    if (!offer?.tier) {
        return null;
    }
    const product = getProductFromId({site, productId: offer.tier.id});
    if (!product) {
        return null;
    }
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    this.updateFormErrors();
    const {doAction} = this.context;
    const {name, email, phonenumber, errors} = this.state;
    if (this.hasFormErrors(errors)) {
        return;
    }
    const signupData = {
        name,
        email,
        plan: price?.id,
        offerId: offer?.id,
        phonenumber
    };
    if (hasMultipleNewsletters({site})) {
        this.showNewsletterSelection(signupData);
    } else {
        doAction('signup', signupData);
        this.clearFormErrors();
    }
}

updateFormErrors() {
    this.setState((state) => ({
        errors: this.getFormErrors(state)
    }));
}

hasFormErrors(errors) {
    return errors && Object.values(errors).some(error => !!error);
}

showNewsletterSelection(signupData) {
    this.setState({
        showNewsletterSelection: true,
        pageData: signupData,
        errors: {}
    });
}

clearFormErrors() {
    this.setState({errors: {}});
}