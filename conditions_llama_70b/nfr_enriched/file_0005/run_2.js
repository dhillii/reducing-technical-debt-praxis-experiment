// Extracted function to handle email verification toast message
const getVerificationToastMessage = (emailToVerify: string | undefined): JSX.Element | undefined => {
    if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
        return <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
    }
    return undefined;
};

// ...

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean;}> = ({newsletter, onlyOne}) => {
    // ...

    const {formState, saveState, updateForm, setFormState, handleSave, validate, errors, clearError, okProps} = useForm({
        // ...
        onSave: async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            const toastMessage = getVerificationToastMessage(emailToVerify);

            if (toastMessage) {
                showToast({
                    icon: 'email',
                    message: toastMessage,
                    type: 'info'
                });
            }
        },
        // ...
    });

    // ...
};

// ...