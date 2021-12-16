import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([{
			name: 'WORKFLOW_SERVICE',
			transport: Transport.RMQ,
			options: {
				urls: [process.env.BROKER_URL],
				queue: 'workflow',
				queueOptions: {
					durable: false
				}
			}
		}]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService]
})
export class WorkflowModule {}
