import type {
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export interface RecognitionRepositoryPort {
  findById(id: UUID): Promise<Recognition | null>;
  listByMatch(matchId: UUID): Promise<readonly Recognition[]>;
  getWorkflowByMatch(matchId: UUID): Promise<RecognitionWorkflow>;
  updateWorkflowStatus(
    matchId: UUID,
    status: RecognitionWorkflowStatus,
  ): Promise<RecognitionWorkflow>;
}

export class RecognitionRepository
  extends DrizzleRepository<Recognition>
  implements RecognitionRepositoryPort
{
  private readonly workflows = new Map<UUID, RecognitionWorkflow>();

  constructor(initialRows: readonly Recognition[] = []) {
    super({ tableName: 'recognitions', initialRows });
  }

  listByMatch(matchId: UUID): Promise<readonly Recognition[]> {
    return Promise.resolve(this.values().filter((recognition) => recognition.matchId === matchId));
  }

  getWorkflowByMatch(matchId: UUID): Promise<RecognitionWorkflow> {
    return Promise.resolve(this.workflows.get(matchId) ?? { matchId, status: 'not_started' });
  }

  updateWorkflowStatus(
    matchId: UUID,
    status: RecognitionWorkflowStatus,
  ): Promise<RecognitionWorkflow> {
    const workflow = { matchId, status };
    this.workflows.set(matchId, workflow);

    return Promise.resolve(workflow);
  }
}

export class RecognitionsRepository extends RecognitionRepository {}
