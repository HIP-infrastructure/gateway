import { Module, HttpModule } from '@nestjs/common';
import { RemoteAppController } from './remote-app.controller';
import { RemoteAppService } from './remote-app.service';

@Module({
  imports: [HttpModule],
  controllers: [RemoteAppController],
  providers: [RemoteAppService]
})
export class RemoteAppModule { }
