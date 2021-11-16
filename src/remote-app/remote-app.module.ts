import { Module, HttpModule } from '@nestjs/common'
import { RemoteAppController } from './remote-app.controller'
import { RemoteAppService } from './remote-app.service'
import { CacheService } from '../cache/cache.service'
import { BIDSService } from './bids.service'

@Module({
	imports: [HttpModule],
	controllers: [RemoteAppController],
	providers: [RemoteAppService, BIDSService, CacheService],
})
export class RemoteAppModule {}
