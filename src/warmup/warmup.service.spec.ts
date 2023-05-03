import { Test, TestingModule } from '@nestjs/testing';
import { WarmupService } from './warmup.service';

describe('WarmupService', () => {
  let service: WarmupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WarmupService],
    }).compile();

    service = module.get<WarmupService>(WarmupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
