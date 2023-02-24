import { ProjectDto } from "./project.dto"

export class CreateProjectDto {
    readonly title: string
    readonly description: string
    readonly adminId: string
}
