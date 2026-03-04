/**
 * ThreadsGateway — WebSocket gateway for real-time thread messages.
 *
 * Room strategy: one room per thread = `thread:<threadId>`
 * Auth: JWT in socket handshake (same secret as HTTP middleware).
 * Tenant isolation: clients join rooms explicitly; server verifies thread org on join.
 *
 * Events emitted to clients:
 *   thread:message  — new message object
 *   thread:error    — error string
 *
 * Events received from clients:
 *   join            — { threadId }
 *   leave           — { threadId }
 *   message:send    — { threadId, body }
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
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ThreadsService } from './threads.service';

interface AuthPayload {
  sub: string;
  orgId: string;
}

@WebSocketGateway({
  namespace: '/ws/threads',
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:4201'],
    credentials: true,
  },
})
export class ThreadsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ThreadsGateway.name);

  constructor(
    private readonly threads: ThreadsService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  handleConnection(socket: Socket): void {
    const auth = this.extractAuth(socket);
    if (!auth) {
      this.logger.warn(`WS: rejected unauthenticated socket ${socket.id}`);
      socket.disconnect(true);
      return;
    }
    // Attach decoded identity to socket data for later use
    (socket as any).pmAuth = auth;
    this.logger.log(`WS: connected ${socket.id} org=${auth.orgId} user=${auth.sub}`);
  }

  handleDisconnect(socket: Socket): void {
    this.logger.log(`WS: disconnected ${socket.id}`);
  }

  // ---------------------------------------------------------------------------
  // Client → Server events
  // ---------------------------------------------------------------------------

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { threadId: string },
  ) {
    const auth = this.getAuth(socket);
    if (!auth) return;

    try {
      // Verify thread belongs to org
      await this.threads.findThread(auth.orgId, payload.threadId);
      const room = `thread:${payload.threadId}`;
      await socket.join(room);
      this.logger.log(`WS: ${socket.id} joined ${room}`);
      socket.emit('thread:joined', { threadId: payload.threadId });
    } catch {
      socket.emit('thread:error', { message: 'Thread not found or access denied' });
    }
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { threadId: string },
  ) {
    const room = `thread:${payload.threadId}`;
    await socket.leave(room);
    this.logger.log(`WS: ${socket.id} left ${room}`);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { threadId: string; body: string },
  ) {
    const auth = this.getAuth(socket);
    if (!auth) return;

    try {
      const message = await this.threads.createMessage(
        auth.orgId,
        payload.threadId,
        auth.sub,
        { body: payload.body },
      );
      // Broadcast to all room participants including sender
      const room = `thread:${payload.threadId}`;
      this.server.to(room).emit('thread:message', message);
    } catch (e: unknown) {
      socket.emit('thread:error', {
        message: e instanceof Error ? e.message : 'Failed to send message',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Broadcast helper — called by ThreadsService/ThreadsController after HTTP post
  // ---------------------------------------------------------------------------

  broadcastMessage(threadId: string, message: unknown): void {
    const room = `thread:${threadId}`;
    this.server.to(room).emit('thread:message', message);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractAuth(socket: Socket): AuthPayload | null {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');

    if (!token) return null;

    try {
      const secret = this.config.get<string>('JWT_ACCESS_SECRET', '');
      const payload = jwt.verify(token, secret) as Record<string, unknown>;
      const sub = payload['sub'];
      const orgId = payload['orgId'];
      if (typeof sub === 'string' && typeof orgId === 'string') {
        return { sub, orgId };
      }
      return null;
    } catch {
      return null;
    }
  }

  private getAuth(socket: Socket): AuthPayload | null {
    return (socket as any).pmAuth ?? null;
  }
}
