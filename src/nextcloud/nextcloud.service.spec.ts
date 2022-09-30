import { Test, TestingModule } from '@nestjs/testing';
import { NextcloudService } from './nextcloud.service';

describe('NextcloudService', () => {
  let service: NextcloudService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NextcloudService],
    }).compile();

    service = module.get<NextcloudService>(NextcloudService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
