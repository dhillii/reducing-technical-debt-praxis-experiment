async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([updateMemberData({data, state, api}), updateMemberEmail({data, state, api})]);
    return handleUpdateProfileResponse({dataUpdate, emailUpdate, state});
}

async function handleUpdateProfileResponse({dataUpdate, emailUpdate, state}) {
    // Both data and email updates were successful
    if (dataUpdate && emailUpdate && emailUpdate.success) {
        return handleSuccessfulUpdate({dataUpdate, state});
    }

    // Only data update was successful, or email update failed
    if (dataUpdate) {
        return handleDataUpdateResponse({dataUpdate, state});
    }

    // Only email update was successful, or data update failed
    if (emailUpdate) {
        return handleEmailUpdateResponse({emailUpdate, state});
    }

    // Neither data nor email update was successful
    return handleNoUpdate({state});
}

async function handleSuccessfulUpdate({dataUpdate, state}) {
    return {
        action: 'updateProfile:success',
        member: dataUpdate.member,
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
            message: t('Check your inbox to verify email update')
        })
    };
}

async function handleDataUpdateResponse({dataUpdate, state}) {
    const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = dataUpdate.success ? 'success' : 'error';
    const message = !dataUpdate.success ? t('Failed to update account details') : t('Account details updated successfully');
    return {
        action,
        member: dataUpdate.member,
        page: dataUpdate.success ? 'accountHome' : null,
        popupNotification: createPopupNotification({
            type: action, autoHide: dataUpdate.success, closeable: true, status, state, message
        })
    };
}

async function handleEmailUpdateResponse({emailUpdate, state}) {
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
        page: emailUpdate.success ? 'accountHome' : null,
        popupNotification: createPopupNotification({
            type: action, autoHide: emailUpdate.success, closeable: true, status, state, message
        })
    };
}

async function handleNoUpdate({state}) {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
            message: t('Account details updated successfully')
        })
    };
}