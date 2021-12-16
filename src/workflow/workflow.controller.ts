import {
    Controller, Post, Request as Req,
    Response as Res,
    HttpStatus,
    Logger
} from '@nestjs/common';
import { Request, Response } from 'express'
import { WorkflowService } from './workflow.service';

@Controller('workflow')
export class WorkflowController {

    constructor(private readonly workflowService: WorkflowService) { }

    private readonly logger = new Logger('Workflow Controller')

    @Post('/workflow')
    async workflow(
        //@Body('message') message: any,
        @Req() req: Request,
        // @Res() res: Response
    ) {
        this.logger.log(req.body.name)
        return this.workflowService.workflow(req.body)
    }
}
