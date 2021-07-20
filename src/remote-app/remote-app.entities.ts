import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ContainerState, ContainerType } from './remote-app.types';

@Entity()
export class Error {
  @Column()
  code: string;

  @Column()
  message: string;
}

@Entity()
export class Container {
  @CreateDateColumn()
  created: Date;

  @UpdateDateColumn()
  updated: Date;

  @DeleteDateColumn()
  deleted: Date;

  @Column()
  id: string;

  @Column()
  user: string;

  @Column()
  url: string;

  @Column()
  state: ContainerState;

  @Column((type) => Error)
  error: Error;

  @Column()
  type: ContainerType;
}
