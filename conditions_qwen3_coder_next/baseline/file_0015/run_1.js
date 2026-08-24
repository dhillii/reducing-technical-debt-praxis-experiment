async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const createSuccessNotification = () => createPopupNotification({
        type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
        message: emailUpdate ? t('Check your inbox to verify email update') : t('Account details updated successfully')
    });

    const createFailureNotification = (message) => createPopupNotification({
        type: 'updateProfile:failed', autoHide: true, closeable: true, status: 'error', message, state
    });

    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return {
                action: 'updateProfile:success',
                ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                page: 'accountHome',
                popupNotification: createSuccessNotification()
            };
        }

        const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
        return {
            action: 'updateProfile:failed',
            ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
            popupNotification: createFailureNotification(message)
        };
    }

    if (dataUpdate) {
        const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = dataUpdate.success ? 'success' : 'error';
        const message = dataUpdate.success ? t('Account details updated successfully') : t('Failed to update account details');

        return {
            action,
            ...(dataUpdate.success ? {member: dataUpdate.member, page: 'accountHome'} : {}),
            popupNotification: createPopupNotification({
                type: action, autoHide: dataUpdate.success, closeable: true, status, state, message
            })
        };
    }

    if (emailUpdate) {
        const action = emailUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = emailUpdate.success ? 'success' : 'error';
        const message = emailUpdate.error
            ? chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'))
            : t('Check your inbox to verify email update');

        return {
            action,
            ...(emailUpdate.success ? {page: 'accountHome'} : {}),
            popupNotification: createPopupNotification({
                type: action, autoHide: emailUpdate.success, closeable: true, status, state, message
            })
        };
    }

    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createSuccessNotification()
    };
}