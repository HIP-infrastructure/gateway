import { Controller, Get, Logger } from '@nestjs/common'

import {
	MessagePattern,
	EventPattern,
	RmqContext,
	Ctx,
	Payload,
} from '@nestjs/microservices';
@Controller()
export class AppController {
	private readonly logger = new Logger('AppController')

	@Get('/hello')
	getHello() {
		return { message: 'hello' }
	}

	// @MessagePattern('tags')
	@EventPattern('topic')
	public async execute(@Payload() data: any, @Ctx() context: RmqContext) {
		const channel = context.getChannelRef();
		const orginalMessage = context.getMessage();

		console.log('data', data);

		// channel.ack(orginalMessage);
	}

}
