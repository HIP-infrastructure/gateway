import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
	imports: [HttpModule],
	controllers: [UsersController],
	providers: [UsersService, NextcloudService],
	exports: [UsersModule],
})
export class UsersModule {}
