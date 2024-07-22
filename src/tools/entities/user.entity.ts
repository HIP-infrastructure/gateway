// import { Column, Entity, JoinTable, OneToOne, PrimaryGeneratedColumn } from "typeorm"
import { Patient } from './patient.entity'

// @Entity()
export class User {
	// @PrimaryGeneratedColumn()
	pseudonym: number

	// @Column()
	login: string

	// @Column()
	role: string

	// @JoinTable()
	// @OneToOne(
	//     type => Patient,
	//     patient => patient.user,
	//     {
	//         cascade: true
	//     }
	// )
	patients: Patient[]
}

export class Group {}
