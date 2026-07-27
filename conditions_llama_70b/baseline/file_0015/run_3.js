async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([updateMemberData({data, state, api}), updateMemberEmail({data, state, api})]);

    if (dataUpdate && emailUpdate) {
        return handleBothUpdates({dataUpdate, emailUpdate, state});
    } else if (dataUpdate) {
        return handleDataUpdate({dataUpdate, state});
    } else if (emailUpdate) {
        return handleEmailUpdate({emailUpdate, state});
    } else {
        return handleNoUpdates({state});
    }
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

function handleDataUpdate({dataUpdate, state}) {
    const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = dataUpdate.success ? 'success' : 'error';
    const message = !dataUpdate.success ? t('Failed to update account details') : t('Account details updated successfully');
    return {
        action,
        ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
        ...(dataUpdate.success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action, autoHide: dataUpdate.success, closeable: true, status, state, message
        })
    };
}

function handleEmailUpdate({emailUpdate, state}) {
    const action = emailUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = emailUpdate.success ? 'success' : 'error';
    let message = '';

    if (emailUpdate.error) {
        message = chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'));
    } else {
        message = t('Check your inbox to verify email update');
    }

    return {
        action,
        ...(emailUpdate.success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action, autoHide: emailUpdate.success, closeable: true, status, state, message
        })
    };
}

function handleNoUpdates({state}) {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
            message: t('Account details updated successfully')
        })
    };
}