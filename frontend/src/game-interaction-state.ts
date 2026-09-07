export interface GemPosition {
  x: number
  y: number
}

export interface SelectedGem extends GemPosition {
  type: string
}

export interface InteractionCard {
  id: string
  bonus?: string
  color?: string
  effects?: readonly string[]
}

export type PaymentPlan = Record<string, number>

export interface PurchaseEffects {
  extraToken?: { selectedGem: GemPosition } | { skipped: true }
  steal?: { gemType: string } | { skipped: true }
  wildcard?: { color: string }
  noble?: { id: string }
}

export interface PendingPurchase {
  card: InteractionCard
  paymentPlan: PaymentPlan
}

export interface NobleChoiceContext {
  playerData: {
    ownedNobles: string[]
    availableNobles: string[]
  }
}

export type ActionInteractionState =
  | { kind: 'idle' }
  | { kind: 'take-gems'; message: string; selectedGems: SelectedGem[]; warning: string | null }
  | { kind: 'spend-privilege'; message: string; targetCount: number; maxPrivilegeCount: number; selectedGems: SelectedGem[] }
  | { kind: 'reserve-card'; selectedGold: GemPosition }
  | { kind: 'refill-confirm' }
  | { kind: 'purchase-payment'; title: string; card: InteractionCard | null; playerData?: unknown }
  | { kind: 'extra-token'; purchase: PendingPurchase; effects: PurchaseEffects; message: string; playerData?: unknown }
  | { kind: 'steal-token'; purchase: PendingPurchase; effects: PurchaseEffects; playerData?: unknown; returnToNoble: boolean; nobleContext?: NobleChoiceContext }
  | { kind: 'wildcard'; purchase: PendingPurchase; effects: PurchaseEffects; playerData?: unknown; phase: 'selecting' | 'awaiting-followup' }
  | { kind: 'noble'; purchase: PendingPurchase; effects: PurchaseEffects; context: NobleChoiceContext }
  | { kind: 'mandatory-discard'; open: boolean; completed: boolean; playerData?: unknown }

export type RequestFeedbackState =
  | { kind: 'idle' }
  | { kind: 'pending'; requestId: string; actionType: string }
  | { kind: 'unknown'; requestId: string; actionType: string }
  | { kind: 'ack-success'; requestId: string; actionType: string; replayed: boolean }
  | { kind: 'ack-failure'; requestId: string; actionType: string; message: string }

export type VictoryInteractionState =
  | { kind: 'idle' }
  | { kind: 'victory'; message: string }

export interface GameInteractionState {
  action: ActionInteractionState
  feedback: RequestFeedbackState
  victory: VictoryInteractionState
}

export interface InteractionCommand {
  actionType: string
  data: Record<string, unknown>
}

export interface InteractionTransition {
  state: GameInteractionState
  commands: InteractionCommand[]
  schedulePurchaseFollowup: boolean
}

export type GameInteractionEvent =
  | { type: 'OPEN_TAKE_GEMS'; message: string; initialGemPosition?: SelectedGem }
  | { type: 'OPEN_SPEND_PRIVILEGE'; maxPrivilegeCount: number }
  | { type: 'SELECT_BOARD_GEM'; gem: SelectedGem }
  | { type: 'DESELECT_BOARD_GEM'; position: GemPosition }
  | { type: 'CLEAR_BOARD_GEMS' }
  | { type: 'SET_PRIVILEGE_COUNT'; count: number }
  | { type: 'OPEN_RESERVE_CARD'; selectedGold: GemPosition }
  | { type: 'OPEN_REFILL_CONFIRM' }
  | { type: 'OPEN_PURCHASE_PAYMENT'; title: string; card: InteractionCard | null; playerData?: unknown }
  | { type: 'CONFIRM_TAKE_GEMS' }
  | { type: 'CONFIRM_SPEND_PRIVILEGE' }
  | { type: 'CONFIRM_PURCHASE_PAYMENT'; card: InteractionCard; paymentPlan: PaymentPlan; effects: readonly string[]; extraTokenMessage: string; extraTokenPlayerData?: unknown; stealPlayerData?: unknown; wildcardPlayerData?: unknown; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_EXTRA_TOKEN'; selectedGems: SelectedGem[]; purchaseValid?: boolean; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_STEAL_TOKEN'; stealGemType: string | null; purchaseValid?: boolean; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_WILDCARD'; wildcardColor: string }
  | { type: 'RUN_PURCHASE_FOLLOWUP'; purchaseValid?: boolean; nobleContext?: NobleChoiceContext }
  | { type: 'CONFIRM_NOBLE'; nobleId: string; stealPlayerData?: unknown }
  | { type: 'CANCEL_ACTION' }
  | { type: 'AUTHORITY_REQUIRES_DISCARD'; playerData?: unknown }
  | { type: 'REOPEN_MANDATORY_DISCARD'; playerData?: unknown }
  | { type: 'RESET_MANDATORY_DISCARD' }
  | { type: 'COMPLETE_MANDATORY_DISCARD' }
  | { type: 'REQUEST_SENT'; requestId: string; actionType: string }
  | { type: 'REQUEST_UNKNOWN'; requestId: string; actionType: string }
  | { type: 'ACK_SUCCESS'; requestId: string; actionType: string; replayed?: boolean }
  | { type: 'ACK_FAILURE'; requestId: string; actionType: string; message?: string }
  | { type: 'SHOW_VICTORY'; message: string }
  | { type: 'CLOSE_VICTORY' }

export interface ActionDialogView {
  visible: boolean
  actionType: string
  title: string
  message: string
  selectedCard: InteractionCard | null
  selectedGold?: GemPosition
  initialGemPosition?: SelectedGem
  playerData?: unknown
}

export interface RequestFeedbackView {
  tone: 'info' | 'success' | 'error' | 'warning'
  title: string
  message: string
}

export interface ContextActionBarView {
  mode: 'take-gems' | 'spend-privilege'
  message: string
  selectedGems: SelectedGem[]
  warning: string | null
  targetCount: number
  maxPrivilegeCount: number
  confirmDisabled: boolean
}

const noCommands = (state: GameInteractionState): InteractionTransition => ({
  state,
  commands: [],
  schedulePurchaseFollowup: false
})

const withAction = (
  state: GameInteractionState,
  action: ActionInteractionState,
  commands: InteractionCommand[] = [],
  schedulePurchaseFollowup = false
): InteractionTransition => ({
  state: { ...state, action },
  commands,
  schedulePurchaseFollowup
})

const buyCardCommand = (purchase: PendingPurchase, effects: PurchaseEffects): InteractionCommand => ({
  actionType: 'buyCard',
  data: {
    cardId: purchase.card.id,
    paymentPlan: purchase.paymentPlan,
    effects
  }
})

const completePurchaseStep = (
  state: GameInteractionState,
  purchase: PendingPurchase,
  effects: PurchaseEffects,
  nobleContext?: NobleChoiceContext
): InteractionTransition => {
  if (nobleContext) {
    return withAction(state, { kind: 'noble', purchase, effects, context: nobleContext })
  }
  return withAction(state, { kind: 'idle' }, [buyCardCommand(purchase, effects)])
}

const samePosition = (left: GemPosition, right: GemPosition): boolean =>
  left.x === right.x && left.y === right.y

const isSelectableGem = (gem: SelectedGem): boolean => gem.type.length > 0 && gem.type !== 'gold'

export const isValidTakeGemSelection = (selectedGems: readonly SelectedGem[]): boolean => {
  if (selectedGems.length < 1 || selectedGems.length > 3 || selectedGems.some(gem => !isSelectableGem(gem))) {
    return false
  }
  if (selectedGems.some((gem, index) => selectedGems.slice(index + 1).some(other => samePosition(gem, other)))) {
    return false
  }
  if (selectedGems.length === 1) return true

  const sameRow = selectedGems.every(gem => gem.x === selectedGems[0].x)
  if (sameRow) {
    const columns = selectedGems.map(gem => gem.y).sort((left, right) => left - right)
    return columns.every((column, index) => index === 0 || column === columns[index - 1] + 1)
  }

  const sameColumn = selectedGems.every(gem => gem.y === selectedGems[0].y)
  if (sameColumn) {
    const rows = selectedGems.map(gem => gem.x).sort((left, right) => left - right)
    return rows.every((row, index) => index === 0 || row === rows[index - 1] + 1)
  }

  const sameDescendingDiagonal = selectedGems.every(gem => gem.x - gem.y === selectedGems[0].x - selectedGems[0].y)
  const sameAscendingDiagonal = selectedGems.every(gem => gem.x + gem.y === selectedGems[0].x + selectedGems[0].y)
  if (!sameDescendingDiagonal && !sameAscendingDiagonal) return false
  const rows = selectedGems.map(gem => gem.x).sort((left, right) => left - right)
  return rows.every((row, index) => index === 0 || row === rows[index - 1] + 1)
}

export const getTakeGemsPrivilegeWarning = (selectedGems: readonly SelectedGem[]): string | null => {
  if (selectedGems.length === 3 && selectedGems.every(gem => gem.type === selectedGems[0].type)) {
    return '拿取 3 个同色宝石，对手将获得特权'
  }
  if (selectedGems.filter(gem => gem.type === 'pearl').length >= 2) {
    return '拿取 2 枚珍珠，对手将获得特权'
  }
  return null
}

const boardPositions = (board: readonly (readonly string[])[]): SelectedGem[] =>
  board.flatMap((row, x) => row.map((type, y) => ({ x, y, type })))

export const getSelectableGemPositions = (
  board: readonly (readonly string[])[],
  action: ActionInteractionState
): GemPosition[] => {
  if (action.kind !== 'take-gems' && action.kind !== 'spend-privilege') return []
  const limit = action.kind === 'take-gems' ? 3 : action.targetCount
  if (action.selectedGems.length >= limit) return []

  return boardPositions(board)
    .filter(gem => isSelectableGem(gem))
    .filter(gem => !action.selectedGems.some(selected => samePosition(selected, gem)))
    .filter(gem => action.kind === 'spend-privilege' || isValidTakeGemSelection([...action.selectedGems, gem]))
    .map(({ x, y }) => ({ x, y }))
}

export const getIllegalGemPositions = (
  board: readonly (readonly string[])[],
  action: ActionInteractionState
): GemPosition[] => {
  const selected = action.kind === 'take-gems' || action.kind === 'spend-privilege' ? action.selectedGems : []
  const selectable = getSelectableGemPositions(board, action)
  return boardPositions(board)
    .filter(position => !selected.some(gem => samePosition(gem, position)))
    .filter(position => !selectable.some(gem => samePosition(gem, position)))
    .map(({ x, y }) => ({ x, y }))
}

const isValidSpendPrivilegeSelection = (selectedGems: readonly SelectedGem[], targetCount: number): boolean =>
  selectedGems.length === targetCount &&
  selectedGems.every(isSelectableGem) &&
  !selectedGems.some((gem, index) => selectedGems.slice(index + 1).some(other => samePosition(gem, other)))

const boardInteractionLocked = (state: GameInteractionState): boolean =>
  state.feedback.kind === 'pending' || state.feedback.kind === 'unknown'

export const createGameInteractionState = (): GameInteractionState => ({
  action: { kind: 'idle' },
  feedback: { kind: 'idle' },
  victory: { kind: 'idle' }
})

export const transitionGameInteraction = (
  state: GameInteractionState,
  event: GameInteractionEvent
): InteractionTransition => {
  switch (event.type) {
    case 'OPEN_TAKE_GEMS': {
      if (boardInteractionLocked(state)) return noCommands(state)
      const selectedGems = event.initialGemPosition && isSelectableGem(event.initialGemPosition)
        ? [event.initialGemPosition]
        : []
      return withAction(state, {
        kind: 'take-gems',
        message: event.message,
        selectedGems,
        warning: getTakeGemsPrivilegeWarning(selectedGems)
      })
    }
    case 'OPEN_SPEND_PRIVILEGE': {
      if (boardInteractionLocked(state)) return noCommands(state)
      const maxPrivilegeCount = Math.max(1, Math.min(3, event.maxPrivilegeCount))
      return withAction(state, {
        kind: 'spend-privilege',
        message: '请选择要花费的特权数量，并在棋盘选择相同数量的非黄金宝石。',
        targetCount: 1,
        maxPrivilegeCount,
        selectedGems: []
      })
    }
    case 'SELECT_BOARD_GEM': {
      if (boardInteractionLocked(state) || (state.action.kind !== 'take-gems' && state.action.kind !== 'spend-privilege')) {
        return noCommands(state)
      }
      if (!isSelectableGem(event.gem) || state.action.selectedGems.some(gem => samePosition(gem, event.gem))) {
        return noCommands(state)
      }
      if (state.action.kind === 'take-gems') {
        const selectedGems = [...state.action.selectedGems, event.gem]
        if (!isValidTakeGemSelection(selectedGems)) return noCommands(state)
        return withAction(state, {
          ...state.action,
          selectedGems,
          warning: getTakeGemsPrivilegeWarning(selectedGems)
        })
      }
      if (state.action.selectedGems.length >= state.action.targetCount) return noCommands(state)
      return withAction(state, { ...state.action, selectedGems: [...state.action.selectedGems, event.gem] })
    }
    case 'DESELECT_BOARD_GEM': {
      if (boardInteractionLocked(state) || (state.action.kind !== 'take-gems' && state.action.kind !== 'spend-privilege')) {
        return noCommands(state)
      }
      const selectedGems = state.action.selectedGems.filter(gem => !samePosition(gem, event.position))
      return state.action.kind === 'take-gems'
        ? withAction(state, { ...state.action, selectedGems, warning: getTakeGemsPrivilegeWarning(selectedGems) })
        : withAction(state, { ...state.action, selectedGems })
    }
    case 'CLEAR_BOARD_GEMS':
      if (boardInteractionLocked(state) || (state.action.kind !== 'take-gems' && state.action.kind !== 'spend-privilege')) {
        return noCommands(state)
      }
      return state.action.kind === 'take-gems'
        ? withAction(state, { ...state.action, selectedGems: [], warning: null })
        : withAction(state, { ...state.action, selectedGems: [] })
    case 'SET_PRIVILEGE_COUNT':
      if (boardInteractionLocked(state) || state.action.kind !== 'spend-privilege') return noCommands(state)
      if (event.count < 1 || event.count > state.action.maxPrivilegeCount || event.count === state.action.targetCount) {
        return noCommands(state)
      }
      return withAction(state, { ...state.action, targetCount: event.count, selectedGems: [] })
    case 'OPEN_RESERVE_CARD':
      return withAction(state, { kind: 'reserve-card', selectedGold: event.selectedGold })
    case 'OPEN_REFILL_CONFIRM':
      return withAction(state, { kind: 'refill-confirm' })
    case 'OPEN_PURCHASE_PAYMENT':
      return withAction(state, {
        kind: 'purchase-payment',
        title: event.title,
        card: event.card,
        ...(event.playerData === undefined ? {} : { playerData: event.playerData })
      })
    case 'CONFIRM_TAKE_GEMS': {
      if (boardInteractionLocked(state) || state.action.kind !== 'take-gems' || !isValidTakeGemSelection(state.action.selectedGems)) {
        return noCommands(state)
      }
      const gemPositions = state.action.selectedGems.map(({ x, y }) => ({ x, y }))
      const commands = state.action.warning
        ? [
            { actionType: 'grantOpponentPrivilege', data: {} },
            { actionType: 'takeGems', data: { gemPositions } }
          ]
        : [{ actionType: 'takeGems', data: { gemPositions } }]
      return withAction(state, { kind: 'idle' }, commands)
    }
    case 'CONFIRM_SPEND_PRIVILEGE':
      if (boardInteractionLocked(state) || state.action.kind !== 'spend-privilege' ||
          !isValidSpendPrivilegeSelection(state.action.selectedGems, state.action.targetCount)) {
        return noCommands(state)
      }
      return withAction(state, { kind: 'idle' }, [{
        actionType: 'spendPrivilege',
        data: {
          privilegeCount: state.action.targetCount,
          gemPositions: state.action.selectedGems.map(({ x, y }) => ({ x, y }))
        }
      }])
    case 'CONFIRM_PURCHASE_PAYMENT': {
      if (state.action.kind !== 'purchase-payment') return noCommands(state)
      const purchase = { card: event.card, paymentPlan: event.paymentPlan }
      if (event.effects.includes('extra_token')) {
        return withAction(state, {
          kind: 'extra-token',
          purchase,
          effects: {},
          message: event.extraTokenMessage,
          ...(event.extraTokenPlayerData === undefined ? {} : { playerData: event.extraTokenPlayerData })
        })
      }
      if (event.effects.includes('steal')) {
        return withAction(state, {
          kind: 'steal-token',
          purchase,
          effects: {},
          returnToNoble: false,
          ...(event.stealPlayerData === undefined ? {} : { playerData: event.stealPlayerData })
        })
      }
      if (event.effects.includes('wildcard')) {
        return withAction(state, {
          kind: 'wildcard',
          purchase,
          effects: {},
          phase: 'selecting',
          ...(event.wildcardPlayerData === undefined ? {} : { playerData: event.wildcardPlayerData })
        })
      }
      return completePurchaseStep(state, purchase, {}, event.nobleContext)
    }
    case 'CONFIRM_EXTRA_TOKEN':
      if (state.action.kind !== 'extra-token') return noCommands(state)
      if (event.purchaseValid === false) return withAction(state, { kind: 'idle' })
      return completePurchaseStep(state, state.action.purchase, {
        ...state.action.effects,
        extraToken: event.selectedGems[0]
          ? { selectedGem: { x: event.selectedGems[0].x, y: event.selectedGems[0].y } }
          : { skipped: true }
      }, event.nobleContext)
    case 'CONFIRM_STEAL_TOKEN': {
      if (state.action.kind !== 'steal-token') return noCommands(state)
      const effects: PurchaseEffects = {
        ...state.action.effects,
        steal: event.stealGemType ? { gemType: event.stealGemType } : { skipped: true }
      }
      if (effects.noble?.id === 'noble1') {
        return withAction(state, { kind: 'idle' }, [buyCardCommand(state.action.purchase, effects)])
      }
      if (event.purchaseValid === false) return withAction(state, { kind: 'idle' })
      return completePurchaseStep(state, state.action.purchase, effects, event.nobleContext)
    }
    case 'CONFIRM_WILDCARD':
      if (state.action.kind !== 'wildcard' || state.action.phase !== 'selecting') return noCommands(state)
      return withAction(state, {
        ...state.action,
        phase: 'awaiting-followup',
        effects: { ...state.action.effects, wildcard: { color: event.wildcardColor } }
      }, [], true)
    case 'RUN_PURCHASE_FOLLOWUP':
      if (state.action.kind !== 'wildcard' || state.action.phase !== 'awaiting-followup') return noCommands(state)
      if (event.purchaseValid === false) return withAction(state, { kind: 'idle' })
      return completePurchaseStep(state, state.action.purchase, state.action.effects, event.nobleContext)
    case 'CONFIRM_NOBLE':
      if (state.action.kind !== 'noble') return noCommands(state)
      if (event.nobleId === 'noble1') {
        return withAction(state, {
          kind: 'steal-token',
          purchase: state.action.purchase,
          effects: { ...state.action.effects, noble: { id: event.nobleId } },
          returnToNoble: true,
          nobleContext: state.action.context,
          ...(event.stealPlayerData === undefined ? {} : { playerData: event.stealPlayerData })
        })
      }
      return withAction(state, { kind: 'idle' }, [buyCardCommand(state.action.purchase, {
        ...state.action.effects,
        noble: { id: event.nobleId }
      })])
    case 'CANCEL_ACTION':
      if (state.action.kind === 'steal-token' && state.action.returnToNoble && state.action.nobleContext) {
        const effects = { ...state.action.effects }
        delete effects.noble
        return withAction(state, {
          kind: 'noble',
          purchase: state.action.purchase,
          effects,
          context: state.action.nobleContext
        })
      }
      if (state.action.kind === 'mandatory-discard') {
        return withAction(state, { ...state.action, open: false })
      }
      return withAction(state, { kind: 'idle' })
    case 'AUTHORITY_REQUIRES_DISCARD':
      return withAction(state, {
        kind: 'mandatory-discard',
        open: true,
        completed: false,
        ...(event.playerData === undefined ? {} : { playerData: event.playerData })
      })
    case 'REOPEN_MANDATORY_DISCARD':
      if (state.action.kind !== 'mandatory-discard' || state.action.completed) return noCommands(state)
      return withAction(state, {
        ...state.action,
        open: true,
        ...(event.playerData === undefined ? {} : { playerData: event.playerData })
      })
    case 'RESET_MANDATORY_DISCARD':
      return state.action.kind === 'mandatory-discard'
        ? withAction(state, { kind: 'idle' })
        : noCommands(state)
    case 'COMPLETE_MANDATORY_DISCARD':
      if (state.action.kind !== 'mandatory-discard') return noCommands(state)
      return withAction(state, { ...state.action, open: false, completed: true }, [
        { actionType: 'endTurn', data: {} }
      ])
    case 'REQUEST_SENT':
      return noCommands({
        ...state,
        feedback: { kind: 'pending', requestId: event.requestId, actionType: event.actionType }
      })
    case 'REQUEST_UNKNOWN':
      return noCommands({
        ...state,
        feedback: { kind: 'unknown', requestId: event.requestId, actionType: event.actionType }
      })
    case 'ACK_SUCCESS':
      return noCommands({
        ...state,
        feedback: {
          kind: 'ack-success',
          requestId: event.requestId,
          actionType: event.actionType,
          replayed: event.replayed === true
        }
      })
    case 'ACK_FAILURE':
      return noCommands({
        ...state,
        feedback: {
          kind: 'ack-failure',
          requestId: event.requestId,
          actionType: event.actionType,
          message: event.message || '服务器拒绝了该操作'
        }
      })
    case 'SHOW_VICTORY':
      return noCommands({ ...state, victory: { kind: 'victory', message: event.message } })
    case 'CLOSE_VICTORY':
      return noCommands({ ...state, victory: { kind: 'idle' } })
  }
}

export const toActionDialogView = (action: ActionInteractionState): ActionDialogView => {
  switch (action.kind) {
    case 'idle':
      return { visible: false, actionType: '', title: '', message: '', selectedCard: null }
    case 'take-gems':
    case 'spend-privilege':
      return { visible: false, actionType: '', title: '', message: '', selectedCard: null }
    case 'reserve-card':
      return { visible: true, actionType: 'reserveCard', title: '保留发展卡', message: '请选择要保留的发展卡。', selectedCard: null, selectedGold: action.selectedGold }
    case 'refill-confirm':
      return { visible: true, actionType: 'refillBoard', title: '确认补充版图', message: '补充版图将允许对手获得一个特权指示物，是否继续？', selectedCard: null }
    case 'purchase-payment':
      return { visible: true, actionType: 'buyCard', title: action.title, message: action.card ? '请确认要支付的token数量' : '请选择要购买的发展卡。', selectedCard: action.card, playerData: action.playerData }
    case 'extra-token':
      return { visible: true, actionType: 'takeExtraToken', title: '选择额外 token', message: action.message, selectedCard: action.purchase.card, playerData: action.playerData }
    case 'steal-token':
      return { visible: true, actionType: 'stealToken', title: '选择要窃取的宝石', message: '请选择一种对手拥有的非黄金宝石；若没有可窃取的宝石可点击跳过', selectedCard: action.purchase.card, playerData: action.playerData }
    case 'wildcard':
      return { visible: action.phase === 'selecting', actionType: 'chooseWildcardColor', title: '选择百搭颜色', message: '请选择一个你已拥有优惠的颜色作为本卡的百搭颜色', selectedCard: action.purchase.card, playerData: action.playerData }
    case 'noble':
      return { visible: true, actionType: 'chooseNoble', title: '选择贵族', message: '请选择一个可获得的贵族', selectedCard: action.purchase.card, playerData: action.context.playerData }
    case 'mandatory-discard':
      return { visible: action.open, actionType: 'discardGems', title: '丢弃宝石', message: '您的宝石总数超过10个，请丢弃一些宝石', selectedCard: null, playerData: action.playerData }
  }
}

export const toRequestFeedbackView = (feedback: RequestFeedbackState): RequestFeedbackView | null => {
  switch (feedback.kind) {
    case 'idle':
      return null
    case 'pending':
      return { tone: 'info', title: '请求已发送', message: '正在等待服务器确认' }
    case 'unknown':
      return { tone: 'warning', title: '操作结果未知', message: '连接已中断，正在等待权威状态；不会自动重发操作' }
    case 'ack-success':
      return { tone: 'success', title: '操作成功', message: feedback.replayed ? '服务器已确认该操作此前完成' : '服务器已确认操作完成' }
    case 'ack-failure':
      return { tone: 'error', title: '操作失败', message: feedback.message }
  }
}

export const toContextActionBarView = (action: ActionInteractionState): ContextActionBarView | null => {
  if (action.kind === 'take-gems') {
    return {
      mode: action.kind,
      message: action.message,
      selectedGems: action.selectedGems,
      warning: action.warning,
      targetCount: 3,
      maxPrivilegeCount: 3,
      confirmDisabled: !isValidTakeGemSelection(action.selectedGems)
    }
  }
  if (action.kind === 'spend-privilege') {
    return {
      mode: action.kind,
      message: action.message,
      selectedGems: action.selectedGems,
      warning: null,
      targetCount: action.targetCount,
      maxPrivilegeCount: action.maxPrivilegeCount,
      confirmDisabled: !isValidSpendPrivilegeSelection(action.selectedGems, action.targetCount)
    }
  }
  return null
}
