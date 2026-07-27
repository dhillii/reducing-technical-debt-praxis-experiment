<AlertDialog
  tone="critical"
  title="Delete item"
  cancelLabel="Cancel"
  primaryActionLabel="Yes, delete"
  onPrimaryAction={async () => {
    try {
      await deleteItem()
    } catch (err: any) {
      toastQueue.critical('Unable to delete item', {
        actionLabel: 'Details',
        onAction: () => setErrorDialogValue(err),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.neutral(`${list.singular} deleted.`, {
      timeout: 5000,
    })
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  }}
>
  <Text>
    Are you sure you want to delete <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>? 
    This action cannot be undone.
  </Text>
</AlertDialog>