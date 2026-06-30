import type {
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export interface RecognitionRepositoryPort {
  findById(id: UUID): Promise<Recognition | null>;
  listByMatch(matchId: UUID): Promise<readonly Recognition[]>;
  getWorkflowByMatch(matchId: UUID): Promise<RecognitionWorkflow>;
  updateWorkflowStatus(
    matchId: UUID,
    status: RecognitionWorkflowStatus,
  ): Promise<RecognitionWorkflow>;
}

export class RecognitionsRepository
  extends NotImplementedRepository<Recognition>
  implements RecognitionRepositoryPort
{
  constructor() {
    super('RecognitionsRepository');
  }

  listByMatch(): Promise<readonly Recognition[]> {
    return Promise.reject(new Error('RecognitionsRepository.listByMatch is not implemented yet.'));
  }

  getWorkflowByMatch(): Promise<RecognitionWorkflow> {
    return Promise.reject(
      new Error('RecognitionsRepository.getWorkflowByMatch is not implemented yet.'),
    );
  }

  updateWorkflowStatus(): Promise<RecognitionWorkflow> {
    return Promise.reject(
      new Error('RecognitionsRepository.updateWorkflowStatus is not implemented yet.'),
    );
  }
}
