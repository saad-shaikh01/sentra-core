# NOTIF-004 + NOTIF-005 — Notifications REST API & Socket.io Gateway (core-service)

## Overview
These two tickets are implemented together as one NestJS module (`NotificationsModule`) in core-service.
- **NOTIF-004**: REST endpoints for listing, marking read, and push token management
- **NOTIF-005**: Socket.io `/notifications` namespace for real-time delivery

Both go in the same folder and module — implement them together in one go.

## Prerequisites
- NOTIF-001 (schema), NOTIF-002 (BullMQ), NOTIF-003 (NotificationHelper) all completed

## Scope
**Files to create:**
```
apps/backend/core-service/src/modules/notifications/
├── notifications.module.ts
├── notifications.controller.ts
├── notifications.service.ts
├── notifications.gateway.ts
├── fcm.service.ts                ← stub for now (NOTIF-012 will fill it in)
└── dto/
    ├── query-notifications.dto.ts
    └── register-push-token.dto.ts
```
**Modify:**
- `apps/backend/core-service/src/app.module.ts` — import `NotificationsModule`

---

## NOTIF-005: Socket.io Gateway

### notifications.gateway.ts

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  namespace: '/notifications',
  path: '/socket.io-notifications/',
  cors: { origin: '*', credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track online users: userId → Set of socketIds
  private onlineUsers = new Map<string, Set<string>>();

  handleConnection(socket: Socket) {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.disconnect();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        sub: string;
        orgId: string;
      };

      const userId = decoded.sub;
      const orgId = decoded.orgId;

      socket.data.userId = userId;
      socket.data.orgId = orgId;

      // Join user-specific room and org room
      socket.join(`user:${userId}`);
      socket.join(`org:${orgId}`);

      // Track online status
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(socket.id);
    } catch {
      socket.disconnect();
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
```

**IMPORTANT:** The JWT_SECRET must match the one used by auth. Look at how comm-service gateway reads the JWT secret and replicate the same pattern exactly.

---

## NOTIF-004: REST API

### dto/query-notifications.dto.ts

```typescript
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryNotificationsDto {
  @IsOptional()
  @IsEnum(['true', 'false'])
  isRead?: 'true' | 'false';

  @IsOptional()
  @IsEnum(['SALES', 'PM', 'HRMS', 'COMM', 'SYSTEM'])
  module?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
```

### dto/register-push-token.dto.ts

```typescript
import { IsString, IsEnum, IsOptional } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsEnum(['WEB', 'ANDROID', 'IOS'])
  platform: 'WEB' | 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  userAgent?: string;
}
```

### notifications.service.ts

```typescript
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async list(userId: string, orgId: string, query: QueryNotificationsDto) {
    const where = {
      recipientId: userId,
      organizationId: orgId,
      ...(query.isRead !== undefined && { isRead: query.isRead === 'true' }),
      ...(query.module && { module: query.module as any }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.globalNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
      }),
      this.prisma.globalNotification.count({ where }),
      this.prisma.globalNotification.count({
        where: { recipientId: userId, organizationId: orgId, isRead: false },
      }),
    ]);

    return {
      data: notifications,
      total,
      unreadCount,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.globalNotification.findFirst({
      where: { id, recipientId: userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.globalNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    // Emit updated unread count
    const unreadCount = await this.prisma.globalNotification.count({
      where: { recipientId: userId, organizationId: notification.organizationId, isRead: false },
    });
    this.gateway.emitUnreadCount(userId, unreadCount);

    return updated;
  }

  async markAllRead(userId: string, orgId: string) {
    await this.prisma.globalNotification.updateMany({
      where: { recipientId: userId, organizationId: orgId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.emitUnreadCount(userId, 0);
    return { success: true };
  }

  async registerPushToken(userId: string, orgId: string, dto: RegisterPushTokenDto) {
    // Upsert — same token might re-register after reinstall
    return this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        organizationId: orgId,
        token: dto.token,
        platform: dto.platform as any,
        userAgent: dto.userAgent,
      },
      update: { userId, organizationId: orgId, updatedAt: new Date() },
    });
  }

  async unregisterPushToken(token: string, userId: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { success: true };
  }

  // Called by other services via HTTP (e.g. comm-service)
  async createInternal(payload: NotificationJobPayload) {
    // Directly enqueue via NotificationHelper
    // This endpoint is for services that DON'T have BullMQ access (e.g. comm-service)
    // Inject Queue here same as NotificationHelper
  }
}
```

### notifications.controller.ts

```typescript
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)    // Use same guard as rest of core-service
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: QueryNotificationsDto) {
    return this.service.list(user.userId, user.organizationId, query);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.markRead(id, user.userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.service.markAllRead(user.userId, user.organizationId);
  }

  @Post('push-tokens')
  registerToken(
    @CurrentUser() user: RequestUser,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.service.registerPushToken(user.userId, user.organizationId, dto);
  }

  @Delete('push-tokens/:token')
  unregisterToken(@Param('token') token: string, @CurrentUser() user: RequestUser) {
    return this.service.unregisterPushToken(token, user.userId);
  }

  // Internal endpoint — for comm-service and other services without BullMQ
  // Add IP whitelist / internal secret header guard here
  @Post('internal')
  createInternal(@Body() payload: any) {
    return this.service.createInternal(payload);
  }
}
```

**IMPORTANT for controller:** Look at how other controllers in core-service use `JwtAuthGuard` and `@CurrentUser()` decorator — replicate the EXACT same pattern. Do NOT invent a new auth pattern.

### notifications.module.ts

```typescript
@Module({
  imports: [
    NotificationQueueModule,  // from NOTIF-002
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsGateway, NotificationsService],
})
export class NotificationsModule {}
```

### FcmService stub (to avoid compile errors until NOTIF-012)

```typescript
// fcm.service.ts — stub, will be replaced by NOTIF-012
@Injectable()
export class FcmService {
  async sendMulticast(_opts: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    // TODO: implemented in NOTIF-012
    return;
  }
}
```

---

## Update NotificationQueueProcessor (from NOTIF-002)

Once this module is done, go back to `notification-queue.processor.ts` and:
1. Remove `@Optional()` from `NotificationsGateway` injection
2. Ensure it calls `gateway.emitToUser()` correctly

---

## Acceptance Criteria

### Gateway (NOTIF-005)
- [ ] Namespace is exactly `/notifications`, path is `/socket.io-notifications/`
- [ ] JWT verified on connect using same secret as rest of app
- [ ] Socket joins `user:{userId}` room on connect
- [ ] Socket joins `org:{orgId}` room on connect
- [ ] `emitToUser(userId, event, data)` method works
- [ ] `isUserOnline(userId)` returns correct boolean
- [ ] `emitUnreadCount(userId, count)` emits `notification:count` event
- [ ] Unauthenticated sockets are disconnected immediately

### REST API (NOTIF-004)
- [ ] `GET /api/notifications` returns paginated list with `unreadCount` in response
- [ ] `isRead` filter works: `?isRead=true` returns only read, `?isRead=false` returns only unread
- [ ] `module` filter works: `?module=SALES` returns only sales notifications
- [ ] `PATCH /api/notifications/:id/read` marks single notification read
- [ ] `PATCH /api/notifications/read-all` marks all read, emits `notification:count` with 0
- [ ] `POST /api/notifications/push-tokens` upserts token (no duplicate tokens)
- [ ] `DELETE /api/notifications/push-tokens/:token` removes token
- [ ] All endpoints require JWT auth
- [ ] `POST /api/notifications/internal` does NOT require user JWT (internal use)

## Failure Criteria (reject if any)

- Gateway uses different namespace or path than specified
- JWT secret hardcoded instead of from env
- Missing `user:{userId}` room join (per-user delivery won't work)
- List endpoint returns notifications from OTHER users/orgs
- Push token upsert not used (could create duplicate tokens for same device)
- `PATCH /api/notifications/read-all` doesn't emit updated unread count via socket

## Testing

```bash
# Test REST endpoints with curl/Postman:
# GET /api/notifications?isRead=false&limit=10
# Should return: { data: [...], total: N, unreadCount: N, page: 1, limit: 10 }

# Test Socket.io:
# Connect to ws://localhost:3001/socket.io-notifications/ with JWT
# Should receive 'notification:new' events when queue processor runs
# Should receive 'notification:count' after marking read

# Verify socket path by checking it doesn't conflict with comm-service (/socket.io-comm/)
```
