async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    if (!dataUpdate && !emailUpdate) {
        return createSuccessUpdateProfileResponse(state);
    }

    if (dataUpdate && emailUpdate) {
        return handleBothUpdates({dataUpdate, emailUpdate, state});
    }

    if (dataUpdate) {
        return handleDataUpdateOnly({dataUpdate, state});
    }

    if (emailUpdate) {
        return handleEmailUpdateOnly({emailUpdate, state});
    }

    return createSuccessUpdateProfileResponse(state);
}

function handleBothUpdates({dataUpdate, emailUpdate, state}) {
    if (emailUpdate.success) {
        return {
            action: 'updateProfile:success',
            ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
            page: 'accountHome',
            popupNotification: createPopupNotification({
                type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
                message: t('Check your inbox to verify email update')
            })
        };
    }

    const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
    return {
        action: 'updateProfile:failed',
        ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed', autoHide: true, closeable: true, status: 'error', message, state
        })
    };
}

function handleDataUpdateOnly({dataUpdate, state}) {
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

function handleEmailUpdateOnly({emailUpdate, state}) {
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

function createSuccessUpdateProfileResponse(state) {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
            message: t('Account details updated successfully')
        })
    };
}