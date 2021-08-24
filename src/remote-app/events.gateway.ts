import {
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	OnGatewayInit,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Socket, Server } from 'socket.io'
import { Logger } from '@nestjs/common'

@WebSocketGateway()
export class EventsGateway
	implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger('EventsGateway')

	@WebSocketServer() ws: Server

	@SubscribeMessage('msgToServer')
	handleMessage(client: Socket, payload: string): void {
		this.ws.emit('msgToClient', payload)
	}

	afterInit(server: Server) {
		this.logger.log('Init ws server')
	}

	handleDisconnect(client: Socket) {
		this.logger.log(`Client disconnected: ${client.id}`)
	}

	handleConnection(client: Socket, ...args: any[]) {
		this.logger.log(`Client connected: ${client.id}`)
	}

	emit(data: string): void {
		this.ws.emit('remote-app', data)
	}

	emitSuccess(data: string): void {
		this.ws.emit('remote-app.success', data)
	}
}
