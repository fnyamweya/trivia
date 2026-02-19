import type { ClientMessage, ServerMessage } from '@trivia/shared';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type MessageHandler = (message: ServerMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<(status: ConnectionStatus) => void> = new Set();
  private sessionId: string | null = null;
  private token: string | null = null;

  connect(sessionId: string, token: string): void {
    this.sessionId = sessionId;
    this.token = token;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.sessionId || !this.token) return;

    this.notifyStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/sessions/${this.sessionId}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyStatus('connected');

      // Send HELLO message
      this.send({
        type: 'HELLO',
        token: this.token!,
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        this.handlers.forEach((handler) => handler(message));
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onerror = (event) => {
      console.error('WebSocket error:', event);
    };

    this.ws.onclose = (event) => {
      this.ws = null;

      if (event.code === 4001 || event.code === 4003) {
        // Auth error - don't reconnect
        this.notifyStatus('error');
        return;
      }

      // Attempt reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        setTimeout(() => this.doConnect(), delay);
        this.notifyStatus('connecting');
      } else {
        this.notifyStatus('error');
      }
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
    this.token = null;
    this.reconnectAttempts = 0;
    this.notifyStatus('disconnected');
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private notifyStatus(status: ConnectionStatus): void {
    this.statusHandlers.forEach((handler) => handler(status));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
