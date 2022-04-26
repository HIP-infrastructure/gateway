import { Body, Controller, Delete, Get, Post } from '@nestjs/common'
import { CreateBidsDatabaseDto } from './dto/create-bids-database.dto'
import { CreateSubjectDto } from './dto/create-subject.dto'
import { GetBidsDatabaseDto } from './dto/get-bids-database.dto'
import { ToolsService } from './tools.service'

@Controller('tools')
export class ToolsController {

    constructor(
        private readonly toolsService: ToolsService) { }

    @Get('/bids/database')
    findOneDatabase(@Body() getBidsDatabaseDto: GetBidsDatabaseDto) {
        return this.toolsService.getBIDSDatabase(getBidsDatabaseDto)
    }

    @Post('/bids/database')
    createDatabase(@Body() createBidsDatabaseDto: CreateBidsDatabaseDto) {
        return this.toolsService.createBidsDatabase(createBidsDatabaseDto)
    }

    // @Delete('/bids/database')
    // removeOneDatabase() { }

    // @Get('/bids/subject')
    // findOneSubject() { }

    @Post('/bids/database/:name/subject')
    createSubject(@Body() createSubjectDto: CreateSubjectDto) { 
        return this.toolsService.importSubject(createSubjectDto)
    }

    // @Delete('/bids/subject')
    // removeOneSubject() { }


}
