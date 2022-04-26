import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { ToolsModule } from '../src/tools/tools.module'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

jest.setTimeout(30 * 1000)

describe('ToolsController: db.create (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ToolsModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it('/ (GET)', () => {
    const createBidsDatabaseDto = {
      "owner": `${process.env.USER}`,
      "database": "mybidsdb",
      "DatasetDescJSON":
      {
        "Name": "my bids db",
        "License": "MIT",
        "Authors": ["Manuel Spuhler"],
        "Acknowledgements": "CHUV",
        "Funding": "ME",
        "DatasetDOI": "DOI"
      }
    }

    return request(app.getHttpServer())
      .post('/tools/bids/database')
      .send(createBidsDatabaseDto)
      .expect(201)
  })
})
