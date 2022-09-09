import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { ToolsModule } from '../src/tools/tools.module'
import { CreateBidsDatasetDto } from 'src/tools/dto/create-bids-dataset.dto'

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
    const CreateBidsDatasetDto: CreateBidsDatasetDto = {
      "owner": `${process.env.USER}`,
      "database": "mybidsdb",
      "path": "",
      "DatasetDescJSON":
      {
        "Name": "my bids db",
        "BIDSVersion": "1.4.1",
        "License": "MIT",
        "Authors": ["Manuel Spuhler"],
        "Acknowledgements": "CHUV",
        "Funding": "ME",
        "ReferencesAndLinks": "http://me.com",
        "DatasetDOI": "DOI",
      }
    }

    return request(app.getHttpServer())
      .post('/tools/bids/database')
      .send(CreateBidsDatasetDto)
      .expect(201)
  })
})
