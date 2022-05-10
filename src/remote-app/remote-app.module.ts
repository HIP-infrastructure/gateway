import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CacheService } from '../cache/cache.service'
import { RemoteAppController } from './remote-app.controller'
import { RemoteAppService } from './remote-app.service'


@Module({
	imports: [HttpModule],
	controllers: [RemoteAppController],
	providers: [RemoteAppService, CacheService],
})
export class RemoteAppModule { }
