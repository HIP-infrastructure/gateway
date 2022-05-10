export class EditSubjectClinicalDto {
    readonly owner: string
    readonly database: string
    readonly path: string
    readonly subject: string
    readonly clinical: {
        [key: string]: string
    }
}