import { Controller, Delete, Get, Post } from '@nestjs/common';

@Controller('workflows')
export class WorkflowsController {

    @Get('/')
    findAll() {}

    @Get(':id')
    findOne() {}

    @Post()
    create() {}

    @Delete(':id')
    removeOne() {}
}
