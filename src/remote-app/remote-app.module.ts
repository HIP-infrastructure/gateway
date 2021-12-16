import { Module, HttpModule } from '@nestjs/common'
import { RemoteAppController } from './remote-app.controller'
import { RemoteAppService } from './remote-app.service'
import { CacheService } from '../cache/cache.service'

@Module({
	imports: [HttpModule],
	controllers: [RemoteAppController],
	providers: [RemoteAppService, CacheService],
})
export class RemoteAppModule { }
