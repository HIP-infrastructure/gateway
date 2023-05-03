import { HttpModule } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { IamEbrainsService } from './iam-ebrains.service'

describe('IamEbrainsService', () => {
	let service: IamEbrainsService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [HttpModule],
			providers: [
				{
					provide: 'TOKEN',
					useValue: 'my-secret-token'
				},
				IamEbrainsService
			]
		}).compile()

		service = module.get<IamEbrainsService>(IamEbrainsService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	it('should create groups', async () => {
		const r = await service.createGroup('HIP-projects-101')
		expect(r.status).toBeGreaterThanOrEqual(200)
	})

	it('should create groups', async () => {
		const r = await service.createGroup('HIP-projects-102')
		expect(r.status).toBeGreaterThanOrEqual(200)
	})

	it('should add a user to group', async () => {
		const r = await service.addUserToGroup(
			'HIP-projects-101',
			'member',
			'nicedexter'
		)
		console.log(r)
		expect(r.status).toBeGreaterThanOrEqual(200)
	})

	it('should add a user to group', async () => {
		const r = await service.addUserToGroup(
			'HIP-projects-102',
			'member',
			'ncasati'
		)
		console.log(r)
		expect(r.status).toBeGreaterThanOrEqual(200)
	})

	it('should assign a group to a group', async () => {
		const r = await service.assignGroupToGroup(
			'HIP-projects-101',
			'member',
			'HIP-projects-102'
		)
		console.log(r)
		expect(r.status).toBeGreaterThanOrEqual(200)
	})

	it('should get a group', async () => {
		const r = await service.getGroup('HIP-projects-101')
		console.log(r)
		expect(r).toHaveProperty('name')
	})

	it('should delete groups', async () => {
		const r = await service.deleteGroup('HIP-projects-101')
		expect(r.status).toBeGreaterThanOrEqual(200)
	})

	it('should delete groups', async () => {
		const r = await service.deleteGroup('HIP-projects-102')
		expect(r.status).toBeGreaterThanOrEqual(200)
	})
})
