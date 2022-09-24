import { Request as Req, Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { Request } from 'express'

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  findAll() {
    return this.groupsService.findAll();
  }

  @Get(':groupid')
	async findOne(@Param('groupid') groupid: string, @Req() req: Request) {
		const { cookie, requesttoken } = req.headers
		
		return this.groupsService.findOne({ cookie, requesttoken }, groupid)
	}
}
