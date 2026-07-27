// ...

getInputFields({state, fieldNames}) {
    // ...
    const fields = [
        // ...
        {
            type: 'email',
            value: state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            required: true,
            tabIndex: -1,
            errorMessage: errors.email || ''
        },
        // ...
    ];

    // ...
}

// ...

renderSubmitButton() {
    // ...
    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={e => this.handleSignup(e)}
            disabled={disabled}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={-1}
        />
    );
}

// ...