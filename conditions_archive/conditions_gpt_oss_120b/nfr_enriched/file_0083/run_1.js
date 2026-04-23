import router, { useRouter } from 'next/router'
import {
  type FormEvent,
  Fragment,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@keystar/ui/button'
import { AlertDialog, DialogContainer, DialogTrigger } from '@keystar/ui/dialog'
import { Icon } from '@keystar/ui/icon'
import { fileWarningIcon } from '@keystar/ui/icon/icons/fileWarningIcon'
import { Box, VStack } from '@keystar/ui/layout'
import { ProgressCircle } from '@keystar/ui/progress'
import { SlotProvider } from '@keystar/ui/slots'
import { toastQueue } from '@keystar/ui/toast'
import { Heading, Text } from '@keystar/ui/typography'

import { CombinedGraphQLErrors, gql, useMutation } from '../../../../admin-ui/apollo'
import { CreateButtonLink } from '../../../../admin-ui/components/CreateButtonLink'
import { ErrorDetailsDialog } from '../../../../admin-ui/components/Errors'
import { GraphQLErrorNotice } from '../../../../admin-ui/components/GraphQLErrorNotice'
import { PageContainer } from '../../../../admin-ui/components/PageContainer'
import { useList, useListItem } from '../../../../admin-ui/context'
import {
  deserializeItemToValue,
  Fields,
  serializeValueToOperationItem,
  useHasChanges,
  useInvalidFields,
} from '../../../../admin-ui/utils'
import type {
  ActionMeta,
  BaseListTypeInfo,
  ConditionalFilter,
  ConditionalFilterCase,
  ListMeta,
} from '../../../../types'
import { BaseToolbar, ColumnLayout, ItemPageHeader, StickySidebar } from './common'

type ItemPageProps = {
  listKey: string
}

/**
 * Returns a stable callback that always invokes the latest version of `callback`.
 */
function useEventCallback<Func extends (...args: any[]) => unknown>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => callbackRef.current(...args), [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

/**
 * Renders a delete button with confirmation dialog.
 */
function DeleteButton({
  list,
  itemId,
  itemLabel,
}: {
  list: ListMeta
  itemId: string
  itemLabel: string
}) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const router = useRouter()
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  const handleDelete = async () => {
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

    toastQueue.neutral(`${list.singular} deleted.`, { timeout: 5000 })
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  }

  return (
    <Fragment>
      <DialogTrigger>
        <Button tone="critical">Delete</Button>
        <AlertDialog
          tone="critical"
          title="Delete item"
          cancelLabel="Cancel"
          primaryActionLabel="Yes, delete"
          onPrimaryAction={handleDelete}
        >
          <Text>
            Are you sure you want to delete{' '}
            <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>? This action cannot be
            undone.
          </Text>
        </AlertDialog>
      </DialogTrigger>

      <DialogContainer onDismiss={() => setErrorDialogValue(null)} isDismissable>
        {errorDialogValue && (
          <ErrorDetailsDialog title="Unable to delete item" error={errorDialogValue} />
        )}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Simple placeholder for missing items.
 */
function ItemNotFound(props: PropsWithChildren) {
  return (
    <VStack
      alignItems="center"
      backgroundColor="surface"
      borderRadius="medium"
      gap="large"
      justifyContent="center"
      minHeight="scale.3000"
      padding="xlarge"
    >
      <Icon src={fileWarningIcon} color="neutralEmphasis" size="large" />
      <Heading align="center">Not found</Heading>
      <SlotProvider slots={{ text: { align: 'center', maxWidth: 'scale.5000' } }}>
        {props.children}
      </SlotProvider>
    </VStack>
  )
}

/**
 * Reset button with confirmation dialog.
 */
function ResetButton(props: { onReset: () => void; hasChanges?: boolean }) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!props.hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={props.onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

/**
 * Handles the save operation for an item form.
 */
function useItemSave({
  list,
  itemId,
  initialValue,
  onSaveSuccess,
  setUpdateError,
}: {
  list: ListMeta
  itemId: string
  initialValue: Record<string, unknown>
  onSaveSuccess: () => void
  setUpdateError: (err: Error | null) => void
}) {
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const handleSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const { error: _error } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, e.currentTarget['value'], initialValue),
      },
    })
    const gqlError = CombinedGraphQLErrors.is(_error)
      ? _error.errors.find(x => !x.path || x.path?.length === 1)
      : _error
    if (gqlError) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(gqlError.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, { timeout: 5000 })
    onSaveSuccess()
  })

  return { handleSave, loading, error }
}

/**
 * Renders the form for editing an item.
 */
function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [value, setValue] = useState(() => initialValue)

  useEffect(() => setValue(initialValue), [initialValue])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)

  const { handleSave, loading, error } = useItemSave({
    list,
    itemId,
    initialValue,
    onSaveSuccess,
    setUpdateError,
  })

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      const needsValidation = invalidFields.size !== 0
      setForceValidation(needsValidation)
      if (!needsValidation) {
        handleSave(e)
      }
    },
    [invalidFields, handleSave]
  )

  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  return (
    <Fragment>
      <form onSubmit={onSubmit} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => !x.path || x.path?.length === 1)
                : [error]
            }
          />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={useCallback(v => setValue(v), [])}
            value={value}
            isRequireds={isRequireds}
          />
        </VStack>

        <StickySidebar>
          <Fields
            view="itemView"
            position="sidebar"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            onChange={useCallback(v => setValue(v), [])}
            value={value}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            isRequireds={isRequireds}
          />
        </StickySidebar>

        <BaseToolbar>
          <Button
            isDisabled={!hasChangedFields}
            isPending={loading}
            prominence="high"
            type="submit"
          >
            Save
          </Button>
          <ResetButton hasChanges={hasChangedFields} onReset={() => setValue(initialValue)} />
          <Box flex />
          {!list.hideDelete && <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Helper to compute the page title based on list and label.
 */
function computePageTitle(list: ListMeta, label: string | undefined): string {
  return list.isSingleton || typeof label !== 'string' ? list.label : label
}

/**
 * Helper to render the appropriate not‑found UI.
 */
function renderNotFound({
  list,
  itemId,
  pageLabel,
}: {
  list: ListMeta
  itemId: string | undefined
  pageLabel: string | undefined
}) {
  if (list.isSingleton) {
    if (itemId === '1') {
      return (
        <ItemNotFound>
          <Text>“{list.label}” doesn’t exist, or you don’t have access to it.</Text>
          {!list.hideCreate && <CreateButtonLink list={list} />}
        </ItemNotFound>
      )
    }
    return (
      <ItemNotFound>
        <Text>
          An item with ID <strong>“{itemId}”</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>“{itemId}”</strong> doesn’t exist, or you don’t have access to it.
      </Text>
    </ItemNotFound>
  )
}

/**
 * Main page component for an item.
 */
function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const routerQuery = useRouter().query.id
  const [itemId] = Array.isArray(routerQuery) ? routerQuery : [routerQuery]

  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)
  const item = data?.item
  const rawLabel = item?.[list.labelField] ?? item?.id
  const itemLabel = typeof rawLabel === 'string' ? rawLabel : itemId ?? ''

  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle = computePageTitle(list, pageLabel)

  const initialValue = useMemo(() => {
    if (!item) return null
    return deserializeItemToValue(list.fields, item)
  }, [list.fields, item])

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMemo(() => {
    const actionModes: Record<string, string> = {}
    const fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>> = {}
    const fieldPositions: Record<string, 'form' | 'sidebar'> = {}
    const isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>> = {}

    Object.entries(list.actions).forEach(([k, v]) => {
      actionModes[k] = v.itemView.actionMode
    })
    Object.entries(list.fields).forEach(([k, v]) => {
      fieldModes[k] = v.itemView.fieldMode
      fieldPositions[k] = v.itemView.fieldPosition
      isRequireds[k] = v.itemView.isRequired
    })

    data?.keystone?.adminMeta?.list?.fields?.forEach(field => {
      if (!field?.itemView?.fieldMode) return
      fieldModes[field.key] = field.itemView.fieldMode
      fieldPositions[field.key] = field.itemView.fieldPosition
      isRequireds[field.key] = field.itemView.isRequired
    })

    data?.keystone?.adminMeta?.list?.actions?.forEach(action => {
      if (!action?.itemView?.actionMode) return
      actionModes[action.key] = action.itemView.actionMode
    })

    const actionsInContext = list.actions
      .map(action => ({
        ...action,
        itemView: {
          ...action.itemView,
          actionMode: actionModes[action.key],
        },
      }))
      .filter(action => action.itemView.actionMode !== 'hidden')

    return { actionsInContext, fieldModes, fieldPositions, isRequireds }
  }, [data?.keystone?.adminMeta, list.actions, list.fields])

  const handleAction = (action: ActionMeta, resultId: string | null) => {
    const { navigation } = action.itemView
    if ((navigation === 'follow' && resultId === itemId) || navigation === 'refetch') {
      refetch()
    } else if (navigation === 'follow' && resultId) {
      router.push(`/${list.path}/${resultId}`)
    } else {
      router.push(list.isSingleton ? '/' : `/${list.path}`)
    }
  }

  return (
    <PageContainer
      title={pageTitle}
      header={
        <ItemPageHeader
          list={list}
          actions={actionsInContext}
          label={typeof pageLabel !== 'string' ? 'Loading...' : pageLabel}
          title={pageTitle}
          item={item ?? null}
          onAction={handleAction}
        />
      }
    >
      {pageLoading ? (
        <VStack height="100%" alignItems="center" justifyContent="center">
          <ProgressCircle aria-label="loading item data" size="large" isIndeterminate />
        </VStack>
      ) : (
        <ColumnLayout>
          <Box marginY="xlarge">
            <GraphQLErrorNotice errors={[error]} />
            {item == null && renderNotFound({ list, itemId, pageLabel })}
          </Box>
          {initialValue && (
            <ItemForm
              fieldModes={fieldModes}
              fieldPositions={fieldPositions}
              isRequireds={isRequireds}
              listKey={listKey}
              itemLabel={itemLabel}
              initialValue={initialValue}
              onSaveSuccess={refetch}
            />
          )}
        </ColumnLayout>
      )}
    </PageContainer>
  )
}

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />