import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/pm',
  path: '/socket.io-pm/',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class PmEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PmEventsGateway.name);

  handleConnection(client: Socket): void {
    const orgId = client.handshake.query['orgId'] as string;
    if (orgId) {
      void client.join(`org:${orgId}`);
      this.logger.log(`WS PM: connected ${client.id} org=${orgId}`);
    } else {
      this.logger.warn(`WS PM: connected ${client.id} without orgId`);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`WS PM: disconnected ${client.id}`);
  }

  emitToOrg(organizationId: string, event: string, data: unknown): void {
    this.server.to(`org:${organizationId}`).emit(event, data);
  }
}
