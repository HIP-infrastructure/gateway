import { Request } from 'express'

import {
    Body, Controller, Get, Query, Param, Post, Request as Req, UsePipes, ValidationPipe
} from '@nestjs/common'

import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { GetBidsDatabaseDto } from './dto/get-bids-database.dto'
import { ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {

    constructor(
        private readonly toolsService: ToolsService) { }

    @UsePipes(ValidationPipe)
    @Get('/bids/database')
    findOneDatabase(@Query() getBidsDatabaseDto: GetBidsDatabaseDto) {
        return this.toolsService.getBIDSDatabase(getBidsDatabaseDto)
    }

    @UsePipes(ValidationPipe)
    @Post('/bids/database')
    createDatabase(@Body() createBidsDatabaseDto: CreateBidsDatabaseDto) {
        return this.toolsService.createBidsDatabase(createBidsDatabaseDto)
    }

    // @Delete('/bids/database')
    // removeOneDatabase() { }

    // @Get('/bids/subject')
    // findOneSubject() { }

    @UsePipes(ValidationPipe)
    @Post('/bids/database/subject')
    createSubject(@Body() createSubjectDto: CreateSubjectDto) {
        return this.toolsService.importSubject(createSubjectDto)
    }

    // @Delete('/bids/subject')
    // removeOneSubject() { }

    @UsePipes(ValidationPipe)
    @Get(`/bids/database/participants`)
    getParticipants(
        @Query('path') path: string,
        @Req() req: Request) {

        return this.toolsService.participants(req.headers, path)
    }


}

