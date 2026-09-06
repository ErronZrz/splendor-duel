import { parseWebSocketMessage, type ClientMessage, type ServerMessage } from './protocol'

export interface WebSocketClientHandlers {
  onOpen: () => void
  onMessage: (message: ServerMessage) => void
  onMessageError: (error: unknown) => void
  onClose: (event: CloseEvent) => void
  onError: (event: Event) => void
}

export type WebSocketFactory = (url: string) => WebSocket

const defaultWebSocketFactory: WebSocketFactory = (url) => new WebSocket(url)

export class WebSocketClient {
  private socket: WebSocket | null = null

  constructor(private readonly createSocket: WebSocketFactory = defaultWebSocketFactory) {}

  hasSocket(): boolean {
    return this.socket !== null
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  isConnecting(): boolean {
    return this.socket?.readyState === WebSocket.CONNECTING
  }

  connect(url: string, handlers: WebSocketClientHandlers): void {
    this.close()
    const socket = this.createSocket(url)
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) return
      handlers.onOpen()
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      try {
        const message = parseWebSocketMessage(JSON.parse(event.data as string))
        if (!message) {
          handlers.onMessageError(new Error('无效的 WebSocket 消息'))
          return
        }
        handlers.onMessage(message)
      } catch (error) {
        handlers.onMessageError(error)
      }
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      handlers.onClose(event)
    }
    socket.onerror = (event) => {
      if (this.socket !== socket) return
      handlers.onError(event)
    }
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    if (!this.isOpen() || !this.socket) {
      throw new Error('WebSocket未连接')
    }
    this.socket.send(JSON.stringify(message))
  }

  close(): void {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    socket.close()
  }
}
