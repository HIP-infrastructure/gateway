import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as request from 'supertest'
import { ToolsModule } from '../src/tools/tools.module'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

jest.setTimeout(30 * 1000)

describe('ToolsController: db.get (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ToolsModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it.skip('/ (GET)', async () => {
    const getBidsDatabaseDto = {
      "owner": `${process.env.USER}`,
      "database": "mybidsdb",
      "BIDS_definitions": ["Anat", "Ieeg", "DatasetDescJSON"]
    }

    return await request(app.getHttpServer())
      .get('/tools/bids/database')
      .send(getBidsDatabaseDto)
      .expect(200)
      .expect((response) => {
        expect(response.body.BIDS_definitions.DatasetDescJSON.bids_version).toStrictEqual('1.4.1')
       });
  })
})
