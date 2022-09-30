import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { FilesModule } from 'src/files/files.module'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { UsersModule } from 'src/users/users.module'
import { UsersService } from 'src/users/users.service'
import { CacheService } from '../cache/cache.service'
import { RemoteAppController } from './remote-app.controller'
import { RemoteAppService } from './remote-app.service'


@Module({
	imports: [HttpModule, FilesModule, UsersModule],
	controllers: [RemoteAppController],
	providers: [RemoteAppService, CacheService, NextcloudService, UsersService],
})
export class RemoteAppModule { }
