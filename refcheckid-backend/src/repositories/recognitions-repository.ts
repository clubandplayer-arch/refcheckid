import type {
  Recognition,
  RecognitionWorkflow,
  RecognitionWorkflowStatus,
  UUID,
} from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';
import type { RuntimePersistence } from './runtime-persistence.js';

export interface RecognitionRepositoryPort {
  saveDecision?(input: Omit<Recognition, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Recognition>;
  resetByMatch?(matchId: UUID): Promise<void>;
  clearDecision?(matchId: UUID, registrationId: UUID): Promise<void>;
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
  private readonly workflows = new DrizzleRepository<RecognitionWorkflow & { id: UUID; createdAt: string }>({ tableName: 'recognition_workflows' });

  override bindStore(store: RuntimePersistence): void {
    super.bindStore(store);
    this.workflows.bindStore(store);
  }

  constructor(initialRows: readonly Recognition[] = []) {
    super({ tableName: 'recognitions', initialRows });
  }

  async listByMatch(matchId: UUID): Promise<readonly Recognition[]> {
    return Promise.resolve((await this.values()).filter((recognition) => recognition.matchId === matchId && recognition.deletedAt === null));
  }

  async saveDecision(input: Omit<Recognition, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Recognition> {
    const previous = (await this.listByMatch(input.matchId)).find((row) => row.registrationId === input.registrationId);
    return previous ? this.update(previous.id, input) : this.create(input);
  }

  async resetByMatch(matchId: UUID): Promise<void> {
    for (const row of await this.listByMatch(matchId)) await this.update(row.id, { deletedAt: new Date().toISOString() });
    await this.updateWorkflowStatus(matchId, 'not_started');
  }

  async clearDecision(matchId: UUID, registrationId: UUID): Promise<void> {
    const row = (await this.listByMatch(matchId)).find((entry) => entry.registrationId === registrationId);
    if (row) await this.update(row.id, { deletedAt: new Date().toISOString() });
  }

  async getWorkflowByMatch(matchId: UUID): Promise<RecognitionWorkflow> {
    const row = await this.workflows.findById(matchId);
    return { matchId, status: row?.status ?? 'not_started' };
  }

  async updateWorkflowStatus(
    matchId: UUID,
    status: RecognitionWorkflowStatus,
  ): Promise<RecognitionWorkflow> {
    const workflow = { matchId, status };
    await this.workflows.upsert({ ...workflow, id: matchId, createdAt: new Date().toISOString() });

    return workflow;
  }
}

export class RecognitionsRepository extends RecognitionRepository {}
