import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { CreateSubjectDto } from 'src/tools/dto/create-subject.dto'
import * as request from 'supertest'
import { ToolsModule } from '../src/tools/tools.module'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

jest.setTimeout(60 * 1000)

describe('ToolsController: sub.import (e2e)', () => {
	let app: INestApplication

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [ToolsModule]
		}).compile()

		app = moduleFixture.createNestApplication()
		await app.init()
	})

	it('/ (GET)', async () => {
		const createSubjectDto: CreateSubjectDto = {
			owner: `${process.env.USER}`,
			database: 'mybidsdb',
			path: 'mybidsdb',
			subjects: [
				{
					sub: 'carole',
					age: '25',
					sex: 'M',
					hospital: 'CHUV'
				}
			],
			files: [
				{
					modality: 'ieeg',
					subject: 'carole',
					path: 'sub-carole/SZ1.TRC',
					entities: {
						sub: 'carole',
						ses: 'postimp',
						task: 'stimulation',
						acq: '1024hz'
					}
				},
				{
					modality: 'ieeg',
					subject: 'carole',
					path: 'sub-carole/SZ2.TRC',
					entities: {
						sub: 'carole',
						ses: 'postimp',
						task: 'stimulation',
						acq: '1024hz'
					}
				},
				{
					modality: 'T1w',
					subject: 'carole',
					path: 'sub-carole/3DT1post_deface.nii',
					entities: {
						sub: 'carole',
						ses: 'postimp',
						acq: 'lowres',
						ce: 'gadolinium'
					}
				},
				{
					modality: 'T1w',
					subject: 'carole',
					path: 'sub-carole/3DT1post_deface_2.nii',
					entities: {
						sub: 'carole',
						ses: 'postimp',
						acq: 'lowres',
						ce: 'gadolinium'
					}
				},
				{
					modality: 'T1w',
					subject: 'carole',
					path: 'sub-carole/3DT1pre_deface.nii',
					entities: {
						sub: 'carole',
						ses: 'preimp',
						acq: 'lowres'
					}
				}
			]
		}

		return await request(app.getHttpServer())
			.post('/tools/bids/subject')
			.send(createSubjectDto)
			.expect(201)
		// .expect((response) => {
		//   expect(response.body.BIDS_definitions.DatasetDescJSON.bids_version).toStrictEqual('1.4.1')
		// })
	})
})
