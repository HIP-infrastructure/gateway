import { Test, TestingModule } from '@nestjs/testing'
import { RemoteAppController } from './remote-app.controller'

describe('RemoteAppController', () => {
	let controller: RemoteAppController

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [RemoteAppController],
		}).compile()

		controller = module.get<RemoteAppController>(RemoteAppController)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})
})
