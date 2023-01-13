import { Injectable } from '@nestjs/common'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
const MOCKED_RESPONSE = [
    {
        "name": "Epilepsy 101",
        "id": "HIP-project-epilepsy-101",
        "owner": "Professor Philippe Ryvlin",
        "logo": "media/amu-tng__logo.jpeg",
        "description": "Identification of pharmacoresistant epilepsy",
        "status": "active"
    },
    {
        "name": "Epilepsy 102",
        "id": "HIP-project-epilepsy-102",
        "owner": "Martin J. Brodie",
        "logo": "media/chuv__logo.png",
        "description": "Clobazam and clonazepam use in epilepsy: Results from a UK database incident user cohort study",
        "status": "active"
    },
    {
        "name": "Epilepsy 103",
        "id": "HIP-project-epilepsy-103",
        "owner": "Brian D. Moseley",
        "logo": "media/chuv__logo.png",
        "description": "A review of the drug−drug interactions of the antiepileptic drug brivaracetam"
    },
    {
        "name": "Epilepsy 104",
        "id": "HIP-project-epilepsy-104",
        "owner": "Dr. Olivier David",
        "logo": "media/chuv__logo.png",
        "description": "Incidence of unprovoked seizures and epilepsy in Iceland and assessment of the epilepsy syndrome classification: a prospective study"
    }
]
@Injectable()
export class ProjectsService {
	/*
	 * TODO:
	 * Mount the Collab Filesystem
	 */
	constructor() {}

	/*
	 * TODO:
	 * 1. Create a new group within iam.ebrains.eu
   * 2. Add the owner as admin to the group
	 * 3. Create a new folder in the Collab Filesystem
	 */
	create(createProjectDto: CreateProjectDto) {
		return 'This action adds a new project'
	}

  findAll() {
    return MOCKED_RESPONSE
	}

  /*
  * TODO:
  * 1. Find all projects where the user is a member at iam.ebrains.eu
  */
  findUserProjects(userId: string) {
    return MOCKED_RESPONSE.filter(p => p.status === 'active')
  }

	findOne(id: number) {
		return `This action returns a #${id} project`
	}

	update(id: number, updateProjectDto: UpdateProjectDto) {
		return `This action updates a #${id} project`
	}

	remove(id: number) {
		return `This action removes a #${id} project`
	}
}
