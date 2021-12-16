import { HttpService, Inject, Injectable, Logger } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices';

export const httpService = new HttpService()


@Injectable()
export class WorkflowService {
    constructor(@Inject('WORKFLOW_SERVICE') private client: ClientProxy) { }

    private readonly logger = new Logger('Workflow Service')

    async workflow(data: Record<string | number, unknown>) {
        const message = JSON.stringify(data)
        this.logger.log(data, 'process')

        return this.client.emit('workflow', message);
    }
}
