```typescript
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

type ItemFormProps = {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}

type DeleteButtonProps = {
  list: ListMeta
  itemId: string
  itemLabel: string
}

type ResetButtonProps = {
  onReset: () => void
  hasChanges?: boolean
}

type ItemNotFoundProps = PropsWithChildren

type ItemPageHeaderConfig = {
  actionsInContext: ActionMeta[]
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
}

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

function useDeleteMutation(list: ListMeta, itemId: string) {
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )
  return deleteItem
}

async function handleDeleteSuccess(list: ListMeta, router: ReturnType<typeof useRouter>) {
  toastQueue.neutral(`${list.singular} deleted.`, { timeout: 5000 })
  router.push(list.isSingleton ? '/' : `/${list.path}`)
}

function DeleteButton({ list, itemId, itemLabel }: DeleteButtonProps) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const routerInstance = useRouter()
  const deleteItem = useDeleteMutation(list, itemId)

  const handleDelete = async () => {
    try {
      await deleteItem()
      await handleDeleteSuccess(list, routerInstance)
    } catch (err: any) {
      toastQueue.critical('Unable to delete item', {
        actionLabel: 'Details',
        onAction: () => setErrorDialogValue(err),
        shouldCloseOnAction: true,
      })
    }
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
            Are you sure you want to delete <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>
            ? This action cannot be undone.
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

function ItemNotFound({ children }: ItemNotFoundProps) {
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
        {children}
      </SlotProvider>
    </VStack>
  )
}

function ResetButton({ onReset, hasChanges }: ResetButtonProps) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

function useUpdateMutation(list: ListMeta) {
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )
  return { update, loading, error }
}

function useFormState(initialValue: Record<string, unknown>) {
  const [value, setValue] = useState(() => initialValue)
  const [forceValidation, setForceValidation] = useState(false)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  return { value, setValue, forceValidation, setForceValidation }
}

async function handleFormSubmit(
  e: FormEvent<HTMLFormElement>,
  {
    itemId,
    list,
    value,
    initialValue,
    invalidFields,
    update,
    onSaveSuccess,
    setForceValidation,
    setUpdateError,
  }: {
    itemId: string
    list: ListMeta
    value: Record<string, unknown>
    initialValue: Record<string, unknown>
    invalidFields: Set<string>
    update: (options: any) => Promise<any>
    onSaveSuccess: () => void
    setForceValidation: (val: boolean) => void
    setUpdateError: (err: Error | null) => void
  }
) {
  if (e.target !== e.currentTarget) return
  e.preventDefault()

  const newForceValidation = invalidFields.size !== 0
  setForceValidation(newForceValidation)
  if (newForceValidation) return

  const { error: _error } = await update({
    variables: {
      id: itemId,
      data: serializeValueToOperationItem('update', list.fields, value, initialValue),
    },
  })

  const error = CombinedGraphQLErrors.is(_error)
    ? _error.errors.find(x => x.path === undefined || x.path?.length === 1)
    : _error

  if (error) {
    toastQueue.critical('Unable to save item', {
      actionLabel: 'Details',
      onAction: () => setUpdateError(new Error(error.message)),
      shouldCloseOnAction: true,
    })
    return
  }

  toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
    timeout: 5000,
  })

  onSaveSuccess()
}

function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: ItemFormProps) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const { update, loading, error } = useUpdateMutation(list)
  const { value, setValue, forceValidation, setForceValidation } = useFormState(initialValue)

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    await handleFormSubmit(e, {
      itemId,
      list,
      value,
      initialValue,
      invalidFields,
      update,
      onSaveSuccess,
      setForceValidation,
      setUpdateError,
    })
  })

  const resetValueState = useCallback(() => {
    setValue(initialValue)
  }, [initialValue])

  const fieldsProps = {
    view: 'itemView' as const,
    fields: list.fields,
    groups: list.groups,
    forceValidation,
    invalidFields,
    fieldModes,
    fieldPositions,
    onChange: useCallback((val) => setValue(val), []),
    value,
    isRequireds,
  }

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
                : [error]
            }
          />
          <Fields {...fieldsProps} position="form" />
        </VStack>

        <StickySidebar>
          <Fields {...fieldsProps} position="sidebar" />
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
          {!list.hideDelete && (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          )}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

function buildItemPageConfig(
  list: ListMeta,
  data: any
): ItemPageHeaderConfig {
  const actionModes = Object.fromEntries(
    Object.entries(list.actions).map(([k, v]) => [k, v.itemView.actionMode])
  )
  const fieldModes = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldMode])
  )
  const fieldPositions = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldPosition])
  )
  const isRequireds = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, v.itemView.isRequired])
  )

  // Override with dynamic metadata
  for (const field of data?.keystone?.adminMeta?.list?.fields ?? []) {
    if (
      !field?.itemView ||
      !field.key ||
      !field.itemView.fieldMode ||
      !field.itemView.fieldPosition ||
      !field.itemView.isRequired
    )
      continue
    fieldModes[field.key] = field.itemView.fieldMode
    fieldPositions[field.key] = field.itemView.fieldPosition
    isRequireds[field.key] = field.itemView.isRequired
  }

  for (const action of data?.keystone?.adminMeta?.list?.actions ?? []) {
    if (!action?.itemView?.actionMode || !action.key) continue
    actionModes[action.key] = action.itemView.actionMode
  }

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
}

function useItemPageConfig(list: ListMeta, data: any) {
  return useMemo(() => buildItemPageConfig(list, data), [data?.keystone?.adminMeta, list.fields])
}

function renderItemNotFound(list: ListMeta, itemId: string | undefined) {
  if (list.isSingleton) {
    return itemId === '1' ? (
      <ItemNotFound>
        <Text>"{list.label}" doesn't exist, or you don't have access to it.</Text>
        {!list.hideCreate && <CreateButtonLink list={list} />}
      </ItemNotFound>
    ) : (
      <ItemNotFound>
        <Text>
          An item with ID <strong>"{itemId}"</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>"{itemId}"</strong> doesn't exist, or you don't have access to
        it.
      </Text>
    </ItemNotFound>
  )
}

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const id_ = useRouter().query.id
  const [itemId] = Array.isArray(id_) ? id_ : [id_]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)

  const item = data?.item
  const itemLabel_ = item?