class PopupContent extends React.Component {
    static contextType = AppContext;

    componentDidMount() {
        this.updateContainerHeight();
    }

    componentDidUpdate() {
        this.updateContainerHeight();
    }

    updateContainerHeight() {
        // implement logic to update container height
    }

    handlePopupClose(e) {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            this.context.dispatch('update', {
                showPopup: false
            });
        }
    }

    render() {
        return (
            <Search />
        );
    }
}