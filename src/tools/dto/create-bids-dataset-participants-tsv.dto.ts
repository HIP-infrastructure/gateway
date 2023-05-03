export class Participant {
	readonly [key: string]: string
}

export class CreateBidsDatasetParticipantsTsvDto {
	readonly Participants: Participant[]
}
