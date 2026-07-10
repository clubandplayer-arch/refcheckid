export interface OpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly servers: readonly { readonly url: string }[];
  readonly paths: Record<string, unknown>;
  readonly components: Record<string, unknown>;
}

const domainRoutes = [
  ['Federation', '/api/v1/federations'],
  ['Club', '/api/v1/clubs'],
  ['Player', '/api/v1/players'],
  ['PlayerRegistration', '/api/v1/player-registrations'],
  ['StaffMember', '/api/v1/staff-members'],
  ['StaffRegistration', '/api/v1/staff-registrations'],
  ['Referee', '/api/v1/referees'],
  ['Match', '/api/v1/matches'],
  ['MatchSheet', '/api/v1/match-sheets'],
  ['Recognition', '/api/v1/recognitions'],
  ['MatchReport', '/api/v1/match-reports'],
  ['Audit', '/api/v1/audit'],
  ['Photo', '/api/v1/photos'],
  ['IdentityDocument', '/api/v1/identity-documents'],
] as const;

export function createOpenApiDocument(): OpenApiDocument {
  const paths: Record<string, unknown> = {
    '/api/health': {
      get: {
        tags: ['Health'],
        operationId: 'getHealth',
        responses: { '200': { description: 'API is healthy.' } },
      },
    },

    '/api/v1/players/{id}/photo': contractPath('getPlayerOfficialPhoto', 'Photo', 'defined'),
    '/api/v1/staff-members/{id}/photo': contractPath('getStaffOfficialPhoto', 'Photo', 'defined'),
    '/api/v1/registrations/{id}/season-photo': contractPath(
      'getRegistrationSeasonPhoto',
      'Photo',
      'defined',
    ),
    '/api/v1/photos/upload-intent': contractPath('createPhotoUploadIntent', 'Photo', 'stub'),
    '/api/v1/photos/uploads/{id}/complete': contractPath('completePhotoUpload', 'Photo', 'defined'),
    '/api/v1/photo-approvals': contractPath('listPhotoApprovals', 'PhotoApproval', 'implemented'),
    '/api/v1/photo-approvals/{id}': contractPath(
      'getPhotoApproval',
      'PhotoApproval',
      'implemented',
    ),
    '/api/v1/photo-approvals/{id}/approve': contractPath(
      'approvePhotoApproval',
      'PhotoApproval',
      'implemented',
    ),
    '/api/v1/photo-approvals/{id}/reject': contractPath(
      'rejectPhotoApproval',
      'PhotoApproval',
      'defined',
    ),
    '/api/v1/match-sheets/{id}/photo-snapshots': contractPath(
      'listMatchSheetPhotoSnapshots',
      'Photo',
      'implemented',
    ),
    '/api/v1/matches/{id}/photo-manifest': contractPath(
      'getMatchPhotoManifest',
      'Photo',
      'defined',
    ),
    '/api/v1/photos/audit': contractPath('listPhotoAuditEvents', 'PhotoAudit', 'implemented'),
    '/api/v1/federation-sync': {
      post: {
        tags: ['FederationSync'],
        operationId: 'syncFederationData',
        responses: { '202': { description: 'Synchronization accepted.' } },
      },
    },
  };

  for (const [tag, path] of domainRoutes) {
    paths[path] = {
      get: {
        tags: [tag],
        operationId: `list${tag}`,
        responses: { '200': { description: `${tag} list.` } },
      },
    };
    paths[`${path}/{id}`] = {
      get: {
        tags: [tag],
        operationId: `get${tag}`,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: `${tag} detail.` },
          '404': { description: 'Not found.' },
        },
      },
    };
  }

  Object.assign(paths, {
    '/api/v1/matches/{id}/status': mutationPath('transitionMatchStatus', 'Match'),
    '/api/v1/match-sheets/{id}/submit': mutationPath('submitMatchSheet', 'MatchSheet'),
    '/api/v1/match-sheets/{id}/lock': mutationPath('lockMatchSheet', 'MatchSheet'),
    '/api/v1/recognitions/start': mutationPath('startRecognition', 'Recognition'),
    '/api/v1/recognitions/complete': mutationPath('completeRecognition', 'Recognition'),
    '/api/v1/match-reports/{id}/submit': mutationPath('submitMatchReport', 'MatchReport'),
  });

  return {
    openapi: '3.1.0',
    info: { title: 'RefCheckID REST API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error', 'message'],
          properties: { error: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  };
}

function mutationPath(operationId: string, tag: string): Record<string, unknown> {
  return {
    post: {
      tags: [tag],
      operationId,
      responses: {
        '200': { description: 'Mutation completed.' },
        '400': { description: 'Validation error.' },
      },
    },
  };
}

function contractPath(
  operationId: string,
  tag: string,
  implementationStatus: 'implemented' | 'stub' | 'defined',
): Record<string, unknown> {
  const method = operationId.startsWith('get') || operationId.startsWith('list') ? 'get' : 'post';
  return {
    [method]: {
      tags: [tag],
      operationId,
      'x-implementation-status': implementationStatus,
      responses: {
        '200': { description: `ARCH-1 ${implementationStatus} contract.` },
        '202': { description: 'Accepted stub contract.' },
        '501': { description: 'Defined for a later ARCH-1 milestone.' },
      },
    },
  };
}
