import { ProjectDto } from "./project.dto"

export class CreateProjectDto extends ProjectDto{
    readonly title: string
    readonly description: string
    readonly adminId: string
}
