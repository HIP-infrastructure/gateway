import { Injectable } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  create(createGroupDto: CreateGroupDto) {
    return 'This action adds a new group';
  }

  findAll() {
    return [
      {
        label: 'AMU-NS',
        id: 'amu-ns',
        logo: null,
      },
      {
        label: 'CHUV',
        id: 'chuv',
        logo: 'group__chuv__logo.png',
        description: 'Centre hospitalier universitaire vaudois',
        website: 'https://www.chuv.ch/',
        linkedIn: 'https://www.linkedin.com/company/chuv/',
      },
      {
        label: 'AMU-TNG',
        id: 'amu-tng',
      },
      {
        label: 'APHM',
        id: 'aphm',
      },
      {
        label: 'CHRU-LILLE',
        id: 'chru-lille',
      },
      {
        label: 'CHU-LION',
        id: 'chu-lion',
        logo: null,
      },
      {
        label: 'FNUSA',
        id: 'fnusa',
        logo: null,
      },
      {
        label: 'HUS',
        id: 'hus',
        logo: null,
      },
      {
        label: 'OU-SSE',
        id: 'ou-sse',
        logo: null,
      },
      {
        label: 'PSMAR',
        id: 'psmar',
        logo: null,
      },
      {
        label: 'UCBL',
        id: 'ucbl',
        logo: null,
      },
      {
        label: 'UMCU',
        id: 'umcu',
        logo: null,
      },
    ]
  }
}
