import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketClient, type WebSocketClientHandlers } from './websocket-client'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(readonly url: string) {}

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  receive(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }))
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  send(data: string): void {
    this.sent.push(data)
  }
}

describe('WebSocketClient', () => {
  let sockets: FakeWebSocket[]
  let handlers: WebSocketClientHandlers

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket)
    sockets = []
    handlers = {
      onOpen: vi.fn(),
      onMessage: vi.fn(),
      onMessageError: vi.fn(),
      onClose: vi.fn(),
      onError: vi.fn()
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const createClient = () => new WebSocketClient((url) => {
    const socket = new FakeWebSocket(url)
    sockets.push(socket)
    return socket as unknown as WebSocket
  })

  it('owns serialization and protocol parsing', () => {
    const client = createClient()
    client.connect('ws://example.test/ws/room-1', handlers)
    sockets[0].open()
    client.send({ type: 'player_join', playerId: 'p1', playerName: 'Player 1' })
    sockets[0].receive(JSON.stringify({ type: 'game_state_update', gameState: { status: 'waiting' } }))

    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      type: 'player_join', playerId: 'p1', playerName: 'Player 1'
    })
    expect(handlers.onMessage).toHaveBeenCalledWith({
      type: 'game_state_update', gameState: { status: 'waiting' }
    })
  })

  it('reports malformed JSON and protocol messages without delivering them', () => {
    const client = createClient()
    client.connect('ws://example.test/ws/room-1', handlers)
    sockets[0].receive('{')
    sockets[0].receive(JSON.stringify({ data: {} }))

    expect(handlers.onMessage).not.toHaveBeenCalled()
    expect(handlers.onMessageError).toHaveBeenCalledTimes(2)
  })

  it('isolates callbacks from a replaced socket', () => {
    const client = createClient()
    client.connect('ws://example.test/ws/room-1', handlers)
    const first = sockets[0]
    const staleOpen = first.onopen
    const staleMessage = first.onmessage

    client.connect('ws://example.test/ws/room-2', handlers)
    staleOpen?.(new Event('open'))
    staleMessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'game_end' }) }))

    expect(first.readyState).toBe(FakeWebSocket.CLOSED)
    expect(handlers.onOpen).not.toHaveBeenCalled()
    expect(handlers.onMessage).not.toHaveBeenCalled()
  })

  it('closes intentionally without forwarding a close callback', () => {
    const client = createClient()
    client.connect('ws://example.test/ws/room-1', handlers)
    client.close()

    expect(client.hasSocket()).toBe(false)
    expect(handlers.onClose).not.toHaveBeenCalled()
  })
})
