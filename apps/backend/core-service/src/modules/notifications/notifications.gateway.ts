import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  namespace: '/notifications',
  path: '/socket.io-notifications/',
  cors: { origin: '*', credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Track online users: userId → Set of socketIds
  private onlineUsers = new Map<string, Set<string>>();

  constructor(private readonly config: ConfigService) {}

  handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`NotificationsGateway: rejected unauthenticated socket ${socket.id}`);
        socket.emit('error', { error: 'unauthorized' });
        socket.disconnect(true);
        return;
      }

      const secret = this.config.get<string>('JWT_ACCESS_SECRET', '');
      const decoded = jwt.verify(token, secret) as Record<string, unknown>;
      const sub = decoded['sub'];
      const orgId = decoded['orgId'];

      if (typeof sub !== 'string' || typeof orgId !== 'string') {
        socket.disconnect(true);
        return;
      }

      const userId = sub;

      socket.data.userId = userId;
      socket.data.orgId = orgId;

      // Join user-specific room and org room
      void socket.join(`user:${userId}`);
      void socket.join(`org:${orgId}`);

      // Track online status
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(socket.id);

      this.logger.log(`NotificationsGateway: connected ${socket.id} org=${orgId} user=${userId}`);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      const sockets = this.onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.onlineUsers.delete(userId);
        }
      }
    }
    this.logger.log(`NotificationsGateway: disconnected ${socket.id}`);
  }

  /**
   * Emit a notification to a specific user.
   * Called by NotificationQueueProcessor (NOTIF-002).
   */
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Check if a user is currently connected (online).
   * Used by processor to decide whether to send FCM push.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Emit unread count update to a user.
   */
  emitUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('notification:count', { count });
  }
}
