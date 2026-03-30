/**
 * CommGateway — Socket.io gateway for /comm namespace.
 *
 * Auth:  JWT from socket handshake auth.token
 * Rooms: org:{organizationId} (joined on connect)
 *        user:{userId}         (joined on connect for personal alerts)
 *        entity:{entityType}:{entityId} (joined on client request)
 *
 * Client → Server events:
 *   subscribe:entity   { entityType, entityId }  → join entity room
 *   unsubscribe:entity { entityType, entityId }  → leave entity room
 *
 * Server → Client events (emitted by other services):
 *   message:new     { message }
 *   message:sent    { message }
 *   thread:updated  { thread }
 *   sync:progress   { identityId, processed, total }
 *   identity:error  { identityId, errorMessage }
 *   link:created    { entityType, entityId, threadId }
 *   link:removed    { entityType, entityId, threadId }
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { MetricsService } from '../../common/metrics/metrics.service';

interface CommAuthPayload {
  userId: string;
  organizationId: string;
}

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4201',
  'http://localhost:3005',
];

function resolveCorsOrigins(): string[] {
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configuredOrigins]));
}

@WebSocketGateway({
  namespace: '/comm',
  path: '/socket.io-comm/',
  cors: {
    origin: resolveCorsOrigins(),
    credentials: true,
  },
})
export class CommGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CommGateway.name);

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  handleConnection(socket: Socket): void {
    const auth = this.extractAuth(socket);
    if (!auth) {
      this.logger.warn(`CommGateway: rejected unauthenticated socket ${socket.id}`);
      socket.emit('error', { error: 'unauthorized' });
      socket.disconnect(true);
      return;
    }

    socket.data.commAuth = auth;
    void socket.join(`org:${auth.organizationId}`);
    void socket.join(`user:${auth.userId}`);
    this.metrics.trackWsConnect();
    this.logger.log(
      `CommGateway: connected ${socket.id} org=${auth.organizationId} user=${auth.userId}`,
    );
  }

  handleDisconnect(socket: Socket): void {
    this.metrics.trackWsDisconnect();
    this.logger.log(`CommGateway: disconnected ${socket.id}`);
  }

  // ---------------------------------------------------------------------------
  // Client → Server events
  // ---------------------------------------------------------------------------

  @SubscribeMessage('subscribe:entity')
  async handleSubscribeEntity(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { entityType: string; entityId: string },
  ): Promise<void> {
    if (!socket.data.commAuth) return;
    const room = `entity:${payload.entityType}:${payload.entityId}`;
    await socket.join(room);
    this.logger.debug(`CommGateway: ${socket.id} subscribed to ${room}`);
  }

  @SubscribeMessage('unsubscribe:entity')
  async handleUnsubscribeEntity(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { entityType: string; entityId: string },
  ): Promise<void> {
    const room = `entity:${payload.entityType}:${payload.entityId}`;
    await socket.leave(room);
    this.logger.debug(`CommGateway: ${socket.id} unsubscribed from ${room}`);
  }

  // ---------------------------------------------------------------------------
  // Server-side broadcast helpers (called by other services)
  // ---------------------------------------------------------------------------

  emitToOrg(orgId: string, event: string, payload: unknown): void {
    this.server.to(`org:${orgId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToEntity(entityType: string, entityId: string, event: string, payload: unknown): void {
    this.server.to(`entity:${entityType}:${entityId}`).emit(event, payload);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractAuth(socket: Socket): CommAuthPayload | null {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');

    if (!token) return null;

    try {
      const secret = this.config.get<string>('JWT_ACCESS_SECRET', '');
      const decoded = jwt.verify(token, secret) as Record<string, unknown>;
      const sub = decoded['sub'];
      const orgId = decoded['orgId'];
      if (typeof sub === 'string' && typeof orgId === 'string') {
        return { userId: sub, organizationId: orgId };
      }
      return null;
    } catch {
      return null;
    }
  }
}
