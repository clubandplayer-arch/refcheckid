import type {
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../domain/index.js';
import { join } from 'node:path';
import {
  loadRuntimeState,
  persistRuntimeState,
  PersistentRuntimeRepository,
  resolveRuntimeStateRoot,
} from './runtime-state-repository.js';

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
  extends PersistentRuntimeRepository<Recognition>
  implements RecognitionRepositoryPort
{
  private readonly workflows = new Map<UUID, RecognitionWorkflow>();
  private readonly workflowsPath: string | null;

  constructor(
    initialRows: readonly Recognition[] = [],
    persistenceRoot = resolveRuntimeStateRoot(),
  ) {
    super('recognitions', 'recognitions.json', initialRows, persistenceRoot);
    this.workflowsPath =
      persistenceRoot === null ? null : join(persistenceRoot, 'recognition-workflows.json');
    if (this.workflowsPath !== null) {
      for (const workflow of loadRuntimeState<RecognitionWorkflow>(this.workflowsPath, [])) {
        this.workflows.set(workflow.matchId, workflow);
      }
    }
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
    if (this.workflowsPath !== null) {
      persistRuntimeState(this.workflowsPath, [...this.workflows.values()]);
    }

    return Promise.resolve(workflow);
  }
}

export class RecognitionsRepository extends RecognitionRepository {}
