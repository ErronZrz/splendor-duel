import { describe, expect, it } from 'vitest'
import {
  createGameInteractionState,
  getSelectableGemPositions,
  isValidTakeGemSelection,
  toActionDialogView,
  toContextActionBarView,
  toRequestFeedbackView,
  transitionGameInteraction,
  type GameInteractionEvent,
  type GameInteractionState,
  type NobleChoiceContext
} from './game-interaction-state'

const card = { id: 'flow-card', bonus: 'blue', color: 'blue' }
const paymentPlan = { white: 1, gold: 0 }
const nobleContext: NobleChoiceContext = {
  playerData: { ownedNobles: [], availableNobles: ['noble1', 'noble2'] }
}

const apply = (state: GameInteractionState, event: GameInteractionEvent) =>
  transitionGameInteraction(state, event)

const openPurchase = (): GameInteractionState => apply(createGameInteractionState(), {
  type: 'OPEN_PURCHASE_PAYMENT',
  title: '购买发展卡',
  card
}).state

const confirmPurchase = (effects: readonly string[], context?: NobleChoiceContext) => apply(openPurchase(), {
  type: 'CONFIRM_PURCHASE_PAYMENT',
  card,
  paymentPlan,
  effects,
  extraTokenMessage: '选择额外 token',
  stealPlayerData: { opponent: { gems: { green: 1 } } },
  wildcardPlayerData: { bonus: { white: 1 } },
  ...(context ? { nobleContext: context } : {})
})

describe('game interaction action transitions', () => {
  it('opens idle into direct take and spend modes without ActionDialog', () => {
    const take = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS',
      message: '请选择宝石',
      initialGemPosition: { x: 1, y: 2, type: 'blue' }
    })
    expect(take.state.action).toMatchObject({
      kind: 'take-gems',
      selectedGems: [{ x: 1, y: 2, type: 'blue' }],
      warning: null
    })
    expect(toActionDialogView(take.state.action).visible).toBe(false)
    expect(toContextActionBarView(take.state.action)).toMatchObject({ mode: 'take-gems', confirmDisabled: false })

    const spend = apply(createGameInteractionState(), { type: 'OPEN_SPEND_PRIVILEGE', maxPrivilegeCount: 2 })
    expect(spend.state.action).toMatchObject({
      kind: 'spend-privilege', targetCount: 1, maxPrivilegeCount: 2, selectedGems: []
    })
    expect(toActionDialogView(spend.state.action).visible).toBe(false)
    expect(toContextActionBarView(spend.state.action)).toMatchObject({ mode: 'spend-privilege', confirmDisabled: true })
  })

  it.each([
    [[{ x: 2, y: 1, type: 'white' }, { x: 2, y: 2, type: 'blue' }, { x: 2, y: 3, type: 'green' }], 'horizontal'],
    [[{ x: 1, y: 2, type: 'white' }, { x: 2, y: 2, type: 'blue' }, { x: 3, y: 2, type: 'green' }], 'vertical'],
    [[{ x: 1, y: 1, type: 'white' }, { x: 2, y: 2, type: 'blue' }, { x: 3, y: 3, type: 'green' }], 'descending diagonal'],
    [[{ x: 1, y: 3, type: 'white' }, { x: 2, y: 2, type: 'blue' }, { x: 3, y: 1, type: 'green' }], 'ascending diagonal']
  ])('accepts a contiguous %s selection', (gems) => {
    let state = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: gems[0]
    }).state
    state = apply(state, { type: 'SELECT_BOARD_GEM', gem: gems[1] }).state
    state = apply(state, { type: 'SELECT_BOARD_GEM', gem: gems[2] }).state
    expect(state.action).toMatchObject({ kind: 'take-gems', selectedGems: gems })
    expect(isValidTakeGemSelection(gems)).toBe(true)
  })

  it('exposes only contiguous next candidates and rejects a gap', () => {
    const board = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'white'))
    const opened = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: { x: 2, y: 2, type: 'white' }
    }).state
    const selectable = getSelectableGemPositions(board, opened.action)
    expect(selectable).toContainEqual({ x: 2, y: 3 })
    expect(selectable).toContainEqual({ x: 1, y: 1 })
    expect(selectable).not.toContainEqual({ x: 2, y: 4 })

    const rejected = apply(opened, { type: 'SELECT_BOARD_GEM', gem: { x: 2, y: 4, type: 'white' } })
    expect(rejected.state).toBe(opened)
    expect(rejected.commands).toEqual([])
  })

  it('rejects gold, empty types and duplicate positions', () => {
    const opened = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: { x: 0, y: 0, type: 'white' }
    }).state
    expect(apply(opened, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 1, type: 'gold' } }).state).toBe(opened)
    expect(apply(opened, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 1, type: '' } }).state).toBe(opened)
    expect(apply(opened, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 0, type: 'white' } }).state).toBe(opened)
  })

  it('supports single deselection, clear and cancel', () => {
    let state = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: { x: 0, y: 0, type: 'white' }
    }).state
    state = apply(state, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 1, type: 'blue' } }).state
    state = apply(state, { type: 'DESELECT_BOARD_GEM', position: { x: 0, y: 0 } }).state
    expect(state.action).toMatchObject({ selectedGems: [{ x: 0, y: 1, type: 'blue' }] })
    state = apply(state, { type: 'CLEAR_BOARD_GEMS' }).state
    expect(state.action).toMatchObject({ selectedGems: [] })
    expect(apply(state, { type: 'CANCEL_ACTION' }).state.action.kind).toBe('idle')
  })

  it.each([
    [{ count: 1, gems: [{ x: 0, y: 0, type: 'white' }] }],
    [{ count: 2, gems: [{ x: 0, y: 0, type: 'white' }, { x: 0, y: 1, type: 'blue' }] }],
    [{ count: 3, gems: [{ x: 0, y: 0, type: 'white' }, { x: 0, y: 1, type: 'blue' }, { x: 0, y: 2, type: 'green' }] }]
  ])('submits an ordinary $count-gem take without UI-only fields', ({ gems }) => {
    let state = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: gems[0]
    }).state
    for (const gem of gems.slice(1)) state = apply(state, { type: 'SELECT_BOARD_GEM', gem }).state

    expect(toContextActionBarView(state.action)?.warning).toBeNull()
    expect(apply(state, { type: 'CONFIRM_TAKE_GEMS' }).commands).toEqual([{
      actionType: 'takeGems',
      data: { gemPositions: gems.map(({ x, y }) => ({ x, y })) }
    }])
  })

  it.each([
    [
      [{ x: 0, y: 0, type: 'white' }, { x: 0, y: 1, type: 'white' }, { x: 0, y: 2, type: 'white' }],
      '拿取 3 个同色宝石'
    ],
    [
      [{ x: 0, y: 0, type: 'pearl' }, { x: 0, y: 1, type: 'pearl' }],
      '拿取 2 枚珍珠'
    ]
  ])('keeps the %s warning visible and emits grant before take', (gems, warningText) => {
    let state = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: gems[0]
    }).state
    for (const gem of gems.slice(1)) state = apply(state, { type: 'SELECT_BOARD_GEM', gem }).state
    expect(toContextActionBarView(state.action)?.warning).toContain(warningText)

    const confirmed = apply(state, { type: 'CONFIRM_TAKE_GEMS' })
    expect(confirmed.commands).toEqual([
      { actionType: 'grantOpponentPrivilege', data: {} },
      { actionType: 'takeGems', data: { gemPositions: gems.map(({ x, y }) => ({ x, y })) } }
    ])
  })

  it('resets privilege selections when the target changes and submits only an exact count', () => {
    let state = apply(createGameInteractionState(), { type: 'OPEN_SPEND_PRIVILEGE', maxPrivilegeCount: 3 }).state
    expect(apply(state, { type: 'CONFIRM_SPEND_PRIVILEGE' }).commands).toEqual([])
    state = apply(state, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 0, type: 'white' } }).state
    state = apply(state, { type: 'SET_PRIVILEGE_COUNT', count: 2 }).state
    expect(state.action).toMatchObject({ targetCount: 2, selectedGems: [] })
    state = apply(state, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 0, type: 'white' } }).state
    expect(apply(state, { type: 'CONFIRM_SPEND_PRIVILEGE' }).commands).toEqual([])
    state = apply(state, { type: 'SELECT_BOARD_GEM', gem: { x: 4, y: 4, type: 'blue' } }).state
    const overflow = apply(state, { type: 'SELECT_BOARD_GEM', gem: { x: 2, y: 2, type: 'green' } })
    expect(overflow.state).toBe(state)

    const confirmed = apply(state, { type: 'CONFIRM_SPEND_PRIVILEGE' })
    expect(confirmed.commands).toEqual([{
      actionType: 'spendPrivilege',
      data: { privilegeCount: 2, gemPositions: [{ x: 0, y: 0 }, { x: 4, y: 4 }] }
    }])
  })

  it('locks board mutation and confirmation while pending or unknown', () => {
    const take = apply(createGameInteractionState(), {
      type: 'OPEN_TAKE_GEMS', message: '请选择宝石', initialGemPosition: { x: 0, y: 0, type: 'white' }
    }).state
    const pending = apply(take, { type: 'REQUEST_SENT', requestId: 'r1', actionType: 'takeGems' }).state
    expect(apply(pending, { type: 'SELECT_BOARD_GEM', gem: { x: 0, y: 1, type: 'blue' } }).state).toBe(pending)
    expect(apply(pending, { type: 'CONFIRM_TAKE_GEMS' }).commands).toEqual([])

    const unknown = apply(pending, { type: 'REQUEST_UNKNOWN', requestId: 'r1', actionType: 'takeGems' }).state
    expect(apply(unknown, { type: 'CONFIRM_TAKE_GEMS' }).commands).toEqual([])
  })

  it('selects and clears a market reserve target while keeping the exact gold coordinate', () => {
    let state = apply(createGameInteractionState(), {
      type: 'OPEN_RESERVE_CARD', selectedGold: { x: 1, y: 3 }
    }).state
    expect(toActionDialogView(state.action).visible).toBe(false)
    expect(toContextActionBarView(state.action)).toMatchObject({
      mode: 'reserve-card',
      selectedGold: { x: 1, y: 3 },
      reserveTarget: null,
      confirmDisabled: true
    })

    const target = { type: 'market-card', cardId: 'level-2-card', level: 2, name: '卡牌level-2-card' } as const
    state = apply(state, { type: 'TOGGLE_RESERVE_TARGET', target }).state
    expect(toContextActionBarView(state.action)).toMatchObject({ reserveTarget: target, confirmDisabled: false })
    state = apply(state, { type: 'TOGGLE_RESERVE_TARGET', target }).state
    expect(toContextActionBarView(state.action)?.reserveTarget).toBeNull()
    state = apply(state, { type: 'TOGGLE_RESERVE_TARGET', target }).state
    state = apply(state, { type: 'CLEAR_RESERVE_TARGET' }).state
    expect(toContextActionBarView(state.action)).toMatchObject({ selectedGold: { x: 1, y: 3 }, reserveTarget: null })
  })

  it.each([
    [{ type: 'market-card', cardId: 'level-3-card', level: 3, name: '卡牌level-3-card' } as const, 'level-3-card'],
    [{ type: 'deck', level: 2 } as const, 'deck_level_2']
  ])('submits the exact reserveCard payload for %s without swapping x/y', (target, cardId) => {
    let state = apply(createGameInteractionState(), {
      type: 'OPEN_RESERVE_CARD', selectedGold: { x: 1, y: 3 }
    }).state
    state = apply(state, { type: 'TOGGLE_RESERVE_TARGET', target }).state
    const result = apply(state, { type: 'CONFIRM_RESERVE_CARD' })
    expect(result.commands).toEqual([{
      actionType: 'reserveCard',
      data: { cardId, goldX: 1, goldY: 3 }
    }])
    expect(result.state.action.kind).toBe('idle')
  })

  it('keeps refill inline with a persistent privilege warning and empty payload', () => {
    const opened = apply(createGameInteractionState(), { type: 'OPEN_REFILL_CONFIRM' }).state
    expect(toActionDialogView(opened.action).visible).toBe(false)
    expect(toContextActionBarView(opened.action)).toMatchObject({
      mode: 'refill-confirm',
      warning: '补充版图后，对手获得特权',
      confirmDisabled: false
    })
    expect(apply(opened, { type: 'CONFIRM_REFILL_BOARD' }).commands).toEqual([
      { actionType: 'refillBoard', data: {} }
    ])
  })

  it.each(['pending', 'unknown'] as const)('blocks reserve and refill submissions while feedback is %s', feedbackKind => {
    let reserve = apply(createGameInteractionState(), {
      type: 'OPEN_RESERVE_CARD', selectedGold: { x: 4, y: 2 }
    }).state
    reserve = apply(reserve, {
      type: 'TOGGLE_RESERVE_TARGET',
      target: { type: 'deck', level: 1 }
    }).state
    reserve = apply(reserve, feedbackKind === 'pending'
      ? { type: 'REQUEST_SENT', requestId: 'reserve-request', actionType: 'reserveCard' }
      : { type: 'REQUEST_UNKNOWN', requestId: 'reserve-request', actionType: 'reserveCard' }).state
    expect(apply(reserve, { type: 'CONFIRM_RESERVE_CARD' }).commands).toEqual([])
    expect(apply(reserve, { type: 'TOGGLE_RESERVE_TARGET', target: { type: 'deck', level: 2 } }).state).toBe(reserve)

    let refill = apply(createGameInteractionState(), { type: 'OPEN_REFILL_CONFIRM' }).state
    refill = apply(refill, feedbackKind === 'pending'
      ? { type: 'REQUEST_SENT', requestId: 'refill-request', actionType: 'refillBoard' }
      : { type: 'REQUEST_UNKNOWN', requestId: 'refill-request', actionType: 'refillBoard' }).state
    expect(apply(refill, { type: 'CONFIRM_REFILL_BOARD' }).commands).toEqual([])
  })

  it.each([
    [['extra_token', 'steal', 'wildcard'], 'extra-token'],
    [['steal'], 'steal-token'],
    [['wildcard'], 'wildcard'],
    [[], 'noble']
  ])('selects the existing purchase follow-up for effects %s', (effects, expectedKind) => {
    const result = confirmPurchase(effects, effects.length === 0 ? nobleContext : undefined)
    expect(result.state.action.kind).toBe(expectedKind)
    expect(result.commands).toEqual([])
  })

  it('submits a direct purchase once when no follow-up applies', () => {
    const result = confirmPurchase([])
    expect(result.state.action.kind).toBe('idle')
    expect(result.commands).toEqual([{
      actionType: 'buyCard',
      data: { cardId: 'flow-card', paymentPlan, effects: {} }
    }])
  })

  it('preserves explicit skipped effects', () => {
    const extra = confirmPurchase(['extra_token']).state
    const skippedExtra = apply(extra, { type: 'CONFIRM_EXTRA_TOKEN', selectedGems: [] })
    expect(skippedExtra.commands[0].data).toEqual({
      cardId: 'flow-card', paymentPlan, effects: { extraToken: { skipped: true } }
    })

    const steal = confirmPurchase(['steal']).state
    const skippedSteal = apply(steal, { type: 'CONFIRM_STEAL_TOKEN', stealGemType: null })
    expect(skippedSteal.commands[0].data).toEqual({
      cardId: 'flow-card', paymentPlan, effects: { steal: { skipped: true } }
    })
  })

  it('keeps wildcard confirmation deferred until the zero-delay follow-up', () => {
    const wildcard = confirmPurchase(['wildcard']).state
    const selected = apply(wildcard, { type: 'CONFIRM_WILDCARD', wildcardColor: 'white' })
    expect(selected.commands).toEqual([])
    expect(selected.schedulePurchaseFollowup).toBe(true)
    expect(toActionDialogView(selected.state.action).visible).toBe(false)

    const followedUp = apply(selected.state, { type: 'RUN_PURCHASE_FOLLOWUP' })
    expect(followedUp.commands).toEqual([{
      actionType: 'buyCard',
      data: { cardId: 'flow-card', paymentPlan, effects: { wildcard: { color: 'white' } } }
    }])
  })

  it('keeps noble1 steal confirmation as one final buyCard action', () => {
    const noble = confirmPurchase([], nobleContext).state
    const steal = apply(noble, {
      type: 'CONFIRM_NOBLE',
      nobleId: 'noble1',
      stealPlayerData: { opponent: { gems: { green: 1 } } }
    })
    expect(steal.state.action.kind).toBe('steal-token')
    const confirmed = apply(steal.state, { type: 'CONFIRM_STEAL_TOKEN', stealGemType: 'green' })
    expect(confirmed.commands).toEqual([{
      actionType: 'buyCard',
      data: {
        cardId: 'flow-card',
        paymentPlan,
        effects: { noble: { id: 'noble1' }, steal: { gemType: 'green' } }
      }
    }])
  })

  it('returns noble1 steal cancellation to noble selection and clears the staged noble', () => {
    const noble = confirmPurchase([], nobleContext).state
    const steal = apply(noble, { type: 'CONFIRM_NOBLE', nobleId: 'noble1' }).state
    const canceled = apply(steal, { type: 'CANCEL_ACTION' })
    expect(canceled.state.action.kind).toBe('noble')
    if (canceled.state.action.kind === 'noble') {
      expect(canceled.state.action.effects).toEqual({})
      expect(canceled.state.action.context).toEqual(nobleContext)
    }
  })

  it('keeps direct purchase-effect selections temporary until one final confirmation command', () => {
    const extra = confirmPurchase(['extra_token']).state
    const selectedExtra = apply(extra, { type: 'SELECT_EXTRA_TOKEN', gem: { x: 0, y: 1, type: 'blue' } }).state
    expect(toContextActionBarView(selectedExtra.action)).toMatchObject({ mode: 'extra-token', confirmDisabled: false })
    expect(apply(selectedExtra, { type: 'CLEAR_PURCHASE_EFFECT_SELECTION' }).commands).toEqual([])
    expect(apply(selectedExtra, { type: 'CONFIRM_EXTRA_TOKEN', selectedGems: [] }).commands).toEqual([{
      actionType: 'buyCard',
      data: { cardId: 'flow-card', paymentPlan, effects: { extraToken: { selectedGem: { x: 0, y: 1 } } } }
    }])

    const wildcard = apply(confirmPurchase(['wildcard']).state, { type: 'SELECT_WILDCARD', color: 'white' }).state
    expect(toContextActionBarView(wildcard.action)).toMatchObject({ mode: 'wildcard', selectionLabel: 'white', confirmDisabled: false })
    expect(apply(wildcard, { type: 'CONFIRM_WILDCARD', wildcardColor: 'white' }).commands).toEqual([])
  })
})

describe('mandatory discard authority transitions', () => {
  it('opens, closes abnormally, reopens after authority check, and resets', () => {
    const opened = apply(createGameInteractionState(), {
      type: 'AUTHORITY_REQUIRES_DISCARD',
      playerData: { gems: { white: 12 } }
    })
    expect(toActionDialogView(opened.state.action)).toMatchObject({ visible: true, actionType: 'discardGems' })

    const closed = apply(opened.state, { type: 'CANCEL_ACTION' })
    expect(toActionDialogView(closed.state.action).visible).toBe(false)
    const reopened = apply(closed.state, { type: 'REOPEN_MANDATORY_DISCARD' })
    expect(toActionDialogView(reopened.state.action).visible).toBe(true)
    const reset = apply(reopened.state, { type: 'RESET_MANDATORY_DISCARD' })
    expect(toActionDialogView(reset.state.action)).toMatchObject({ visible: true, actionType: 'discardGems' })
  })

  it('completes with endTurn and prevents the timer transition from reopening', () => {
    const opened = apply(createGameInteractionState(), { type: 'AUTHORITY_REQUIRES_DISCARD' }).state
    const completed = apply(opened, { type: 'COMPLETE_MANDATORY_DISCARD' })
    expect(completed.commands).toEqual([{ actionType: 'endTurn', data: {} }])
    expect(toActionDialogView(completed.state.action).visible).toBe(false)
    const timerResult = apply(completed.state, { type: 'REOPEN_MANDATORY_DISCARD' })
    expect(toActionDialogView(timerResult.state.action).visible).toBe(false)
  })

  it('unlocks stale local interaction only after an authoritative turn resumes', () => {
    const pending = apply(createGameInteractionState(), { type: 'REQUEST_SENT', requestId: 'old', actionType: 'takeGems' }).state
    const resumed = apply(pending, { type: 'AUTHORITATIVE_TURN_RESUMED' }).state
    expect(resumed.action.kind).toBe('idle')
    expect(resumed.feedback.kind).toBe('idle')
  })
})

describe('request feedback and victory projections', () => {
  it.each([
    [{ type: 'REQUEST_SENT', requestId: 'r1', actionType: 'takeGems' } as const, 'pending', '请求已发送'],
    [{ type: 'REQUEST_UNKNOWN', requestId: 'r1', actionType: 'takeGems' } as const, 'unknown', '操作结果未知'],
    [{ type: 'ACK_SUCCESS', requestId: 'r1', actionType: 'takeGems' } as const, 'ack-success', '操作成功'],
    [{ type: 'ACK_FAILURE', requestId: 'r1', actionType: 'takeGems', message: '规则拒绝' } as const, 'ack-failure', '操作失败']
  ])('maps %s to stable page feedback', (event, kind, title) => {
    const result = apply(createGameInteractionState(), event)
    expect(result.state.feedback.kind).toBe(kind)
    expect(toRequestFeedbackView(result.state.feedback)?.title).toBe(title)
  })

  it('keeps the server failure message and success replay wording', () => {
    const failed = apply(createGameInteractionState(), {
      type: 'ACK_FAILURE', requestId: 'r1', actionType: 'buyCard', message: '规则拒绝'
    }).state
    expect(toRequestFeedbackView(failed.feedback)?.message).toBe('规则拒绝')

    const replayed = apply(failed, {
      type: 'ACK_SUCCESS', requestId: 'r1', actionType: 'buyCard', replayed: true
    }).state
    expect(toRequestFeedbackView(replayed.feedback)?.message).toBe('服务器已确认该操作此前完成')
  })

  it('models victory independently from the active action', () => {
    const taking = apply(createGameInteractionState(), { type: 'OPEN_TAKE_GEMS', message: '请选择宝石' }).state
    const won = apply(taking, { type: 'SHOW_VICTORY', message: '本地玩家获得胜利' }).state
    expect(won.action.kind).toBe('take-gems')
    expect(won.victory).toEqual({ kind: 'victory', message: '本地玩家获得胜利' })
    expect(apply(won, { type: 'CLOSE_VICTORY' }).state.victory.kind).toBe('idle')
  })
})
