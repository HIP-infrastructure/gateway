import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { UsersController } from './users.controller'

@Module({
	imports: [HttpModule],
	controllers: [UsersController],
	providers: [NextcloudService],
	exports: [UsersModule],
})
export class UsersModule {}
