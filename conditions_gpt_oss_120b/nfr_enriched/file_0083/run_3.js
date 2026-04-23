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
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
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
 * Generic not‑found UI used for missing items.
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
 * Handles the item form, including validation, saving and UI layout.
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
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const [value, setValue] = useState(() => initialValue)
  const resetValueState = () => setValue(() => initialValue)
  useEffect(() => resetValueState(), [initialValue])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)

  const handleSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const needsValidation = invalidFields.size !== 0
    setForceValidation(needsValidation)
    if (needsValidation) return

    const { error: gqlError } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const errorToShow = CombinedGraphQLErrors.is(gqlError)
      ? gqlError.errors.find(x => x.path === undefined || x.path?.length === 1)
      : gqlError

    if (errorToShow) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(errorToShow.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })
    onSaveSuccess()
  })

  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const sharedFieldProps = {
    view: 'itemView' as const,
    forceValidation,
    invalidFields,
    onChange: useCallback((v: any) => setValue(v), [setValue]),
    value,
    fieldModes,
    fieldPositions,
    isRequireds,
  }

  return (
    <Fragment>
      <form onSubmit={handleSave} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
                : [error]
            }
          />
          <Fields
            {...sharedFieldProps}
            position="form"
            fields={list.fields}
            groups={list.groups}
          />
        </VStack>

        <StickySidebar>
          <Fields
            {...sharedFieldProps}
            position="sidebar"
            fields={list.fields}
            groups={list.groups}
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
          <ResetButton hasChanges={hasChangedFields} onReset={resetValueState} />
          <Box flex />
          {!list.hideDelete ? (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          ) : null}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Computes the display label for an item.
 */
function computeItemLabel(
  item: Record<string, any> | undefined,
  list: ListMeta,
  itemId: string | undefined
): string {
  const rawLabel = item?.[list.labelField] ?? item?.id
  if (typeof rawLabel === 'string') return rawLabel
  return itemId ?? ''
}

/**
 * Extracts field and action mode information from the GraphQL response.
 */
function extractMetaFromData(
  data: any,
  list: ListMeta
): {
  actionsInContext: ActionMeta[]
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
} {
  const actionModes: Record<string, any> = {}
  const fieldModes: Record<string, any> = {}
  const fieldPositions: Record<string, any> = {}
  const isRequireds: Record<string, any> = {}

  // Populate from list definition
  Object.entries(list.actions).forEach(([k, v]) => {
    actionModes[k] = v.itemView.actionMode
  })
  Object.entries(list.fields).forEach(([k, v]) => {
    fieldModes[k] = v.itemView.fieldMode
    fieldPositions[k] = v.itemView.fieldPosition
    isRequireds[k] = v.itemView.isRequired
  })

  // Override with admin meta if present
  const adminFields = data?.keystone?.adminMeta?.list?.fields ?? []
  adminFields.forEach((field: any) => {
    if (!field?.itemView || !field.key) return
    fieldModes[field.key] = field.itemView.fieldMode
    fieldPositions[field.key] = field.itemView.fieldPosition
    isRequireds[field.key] = field.itemView.isRequired
  })

  const adminActions = data?.keystone?.adminMeta?.list?.actions ?? []
  adminActions.forEach((action: any) => {
    if (!action?.itemView?.actionMode || !action.key) return
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

  return {
    actionsInContext,
    fieldModes,
    fieldPositions,
    isRequireds,
  }
}

/**
 * Handles navigation after an item action is performed.
 */
function handleActionNavigation(
  action: ActionMeta,
  resultId: string | null,
  itemId: string | undefined,
  list: ListMeta,
  refetch: () => void
) {
  const { navigation } = action.itemView

  if ((navigation === 'follow' && resultId === itemId) || navigation === 'refetch') {
    refetch()
  } else if (navigation === 'follow' && resultId) {
    router.push(`/${list.path}/${resultId}`)
  } else {
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  }
}

/**
 * Renders the main item page, handling loading, errors and the item form.
 */
function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const routerQuery = useRouter().query.id
  const [itemId] = Array.isArray(routerQuery) ? routerQuery : [routerQuery]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)

  const item = data?.item
  const itemLabel = computeItemLabel(item, list, itemId)

  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle =
    list.isSingleton || typeof pageLabel !== 'string' ? list.label : pageLabel

  const initialValue = useMemo(() => {
    if (!item) return null
    return deserializeItemToValue(list.fields, item)
  }, [list.fields, data?.item])

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMemo(
    () => extractMetaFromData(data, list),
    [data?.keystone?.adminMeta, list.fields, list.actions]
  )

  const onAction = (action: ActionMeta, resultId: string | null) => {
    handleActionNavigation(action, resultId, itemId, list, refetch)
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
          onAction={onAction}
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
            {item == null && (
              <ItemNotFound>
                {list.isSingleton ? (
                  itemId === '1' ? (
                    <>
                      <Text>“{list.label}” doesn’t exist, or you don’t have access to it.</Text>
                      {!list.hideCreate && <CreateButtonLink list={list} />}
                    </>
                  ) : (
                    <Text>
                      An item with ID <strong>“{itemId}”</strong> does not exist.
                    </Text>
                  )
                ) : (
                  <Text>
                    The item with ID <strong>“{itemId}”</strong> doesn’t exist, or you don’t have
                    access to it.
                  </Text>
                )}
              </ItemNotFound>
            )}
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