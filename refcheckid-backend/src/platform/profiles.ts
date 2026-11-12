import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Organizations, PlatformError, optional } from './organizations.js';
import type { Entity, Organization, Membership } from './types.js';
export type ProfileKind = 'organization' | 'club' | 'referee';
export interface IdentityProfile extends Entity {
  kind: ProfileKind;
  subjectId: string;
  revision: number;
  displayName: string;
  description: string;
  website: string;
  primaryColor: string;
  accentColor: string;
  imageKey: string | null;
  imageSource: 'owner' | 'federation';
}
const validKind = (kind: string): ProfileKind => {
  if (!['organization', 'club', 'referee'].includes(kind))
    throw new PlatformError(400, 'Tipo profilo non valido.');
  return kind as ProfileKind;
};
export class Profiles extends Organizations {
  async permission(
    kindValue: string,
    id: string,
    write = false,
  ): Promise<{ name: string; federal: boolean }> {
    const kind = validKind(kindValue),
      admin = this.auth.roles.includes('admin');
    if (kind === 'organization') {
      const org = await this.db.get<Organization>('organizations', id);
      const legacy = await this.app.repositories.federations.findById(id);
      if (!org && !legacy) throw new PlatformError(404, 'Ente non trovato.');
      const federal =
        this.auth.roles.includes('federation') && !!this.auth.federationIds?.includes(id);
      if (admin || federal) return { name: org?.name ?? legacy!.name, federal: true };
      if (org) {
        try {
          await this.scope(id, org.rootUnitId, write ? 'structure' : 'read');
          return { name: org.name, federal: write };
        } catch (error) {
          if (!(error instanceof PlatformError)) throw error;
        }
      }
      if (!write) {
        for (const clubId of this.auth.clubIds ?? []) {
          const club = await this.app.repositories.clubs.findById(clubId);
          if (club?.federationId === id) return { name: org?.name ?? legacy!.name, federal: false };
        }
        for (const refereeId of this.auth.refereeIds ?? []) {
          const referee = await this.app.repositories.referees.findById(refereeId);
          if (referee?.federationId === id)
            return { name: org?.name ?? legacy!.name, federal: false };
        }
      }
    } else if (kind === 'club') {
      const club = await this.app.repositories.clubs.findById(id);
      if (!club) throw new PlatformError(404, 'Club non trovato.');
      const federal =
        admin ||
        (this.auth.roles.includes('federation') &&
          !!this.auth.federationIds?.includes(club.federationId));
      if (federal || (this.auth.roles.includes('manager') && this.auth.clubIds?.includes(id)))
        return { name: club.name, federal };
      const org = await this.db.get<Organization>('organizations', club.federationId);
      if (org) {
        try {
          await this.scope(org.id, org.rootUnitId, write ? 'people' : 'read');
          return { name: club.name, federal: write };
        } catch (error) {
          if (!(error instanceof PlatformError)) throw error;
        }
      }
      if (!write && this.auth.roles.includes('referee')) {
        for (const match of await this.app.repositories.matches.list())
          if (
            (match.homeClubId === id || match.awayClubId === id) &&
            this.auth.refereeIds?.includes(match.refereeId ?? '')
          )
            return { name: club.name, federal: false };
      }
    } else {
      const referee = await this.app.repositories.referees.findById(id);
      if (!referee) throw new PlatformError(404, 'Arbitro non trovato.');
      const federal =
        admin ||
        (this.auth.roles.includes('federation') &&
          !!this.auth.federationIds?.includes(referee.federationId));
      if (federal || (this.auth.roles.includes('referee') && this.auth.refereeIds?.includes(id)))
        return { name: `${referee.firstName} ${referee.lastName}`, federal };
      const rows = await this.db.find<Membership>('memberships', { refereeId: id, active: true });
      for (const row of rows) {
        try {
          await this.scope(row.organizationId, row.unitId, write ? 'people' : 'read');
          return { name: `${referee.firstName} ${referee.lastName}`, federal: write };
        } catch (error) {
          if (!(error instanceof PlatformError)) throw error;
        }
      }
    }
    throw new PlatformError(403, 'Profilo fuori dal tuo ambito.');
  }
  key(kind: string, id: string) {
    return `${validKind(kind)}:${id}`;
  }
  async raw(kind: string, id: string) {
    return this.db.get<IdentityProfile>('identity_profiles', this.key(kind, id));
  }
  async getProfile(kind: string, id: string) {
    const permission = await this.permission(kind, id),
      row = await this.raw(kind, id);
    let canEdit = false;
    try {
      await this.permission(kind, id, true);
      canEdit = true;
    } catch (error) {
      if (!(error instanceof PlatformError)) throw error;
    }
    const imageUrl = row?.imageKey ? await this.imageUrl(row) : null;
    return {
      ...(row ?? {
        kind,
        subjectId: id,
        revision: 0,
        displayName: permission.name,
        description: '',
        website: '',
        primaryColor: '#245cf6',
        accentColor: '#eaf0ff',
        imageSource: 'owner',
      }),
      imageUrl,
      federationId:
        kind === 'club'
          ? (await this.app.repositories.clubs.findById(id))?.federationId
          : kind === 'referee'
            ? (await this.app.repositories.referees.findById(id))?.federationId
            : null,
      canEdit,
    };
  }
  async imageUrl(row: IdentityProfile) {
    if (!row.imageKey) return null;
    // Embed processed bytes locally; cloud objects use short-lived private URLs.
    if (process.env.REFCHECKID_RUNTIME !== 'supabase')
      return `data:image/webp;base64,${(await this.app.objectStores.photos.readObject(row.imageKey)).toString('base64')}`;
    return (
      await this.app.objectStores.photos.createSignedReadUrl({
        objectKey: row.imageKey,
        rendition: 'thumb_320',
        ttlSeconds: 900,
        correlationId: randomUUID(),
      })
    ).url;
  }
  async save(kindValue: string, id: string, body: Record<string, unknown>) {
    const kind = validKind(kindValue),
      permission = await this.permission(kind, id, true),
      previous = await this.raw(kind, id);
    if (body.section !== undefined && !['profile', 'colors'].includes(String(body.section)))
      throw new PlatformError(400, 'Sezione profilo non valida.');
    if (body.section === 'colors') {
      if (kind !== 'organization')
        throw new PlatformError(400, 'I colori si configurano per gli enti.');
      body = {
        ...body,
        displayName: previous?.displayName ?? permission.name,
        description: previous?.description ?? '',
        website: previous?.website ?? '',
      };
      delete body.imageBase64;
      delete body.removeImage;
    } else if (body.section === 'profile') {
      body = {
        ...body,
        primaryColor: previous?.primaryColor ?? '#245cf6',
        accentColor: previous?.accentColor ?? '#eaf0ff',
      };
    }
    if (Number(body.revision) !== (previous?.revision ?? 0))
      throw new PlatformError(409, 'Profilo aggiornato da un altro operatore: ricarica.');
    const primaryColor = String(body.primaryColor ?? previous?.primaryColor ?? '#245cf6'),
      accentColor = String(body.accentColor ?? previous?.accentColor ?? '#eaf0ff');
    if (![primaryColor, accentColor].every((color) => /^#[0-9a-f]{6}$/i.test(color)))
      throw new PlatformError(400, 'Colori non validi.');
    const luminance = (hex: string) => {
      const [r, g, b] = hex
        .slice(1)
        .match(/../g)!
        .map((v) => {
          const c = parseInt(v, 16) / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    if (
      kind === 'organization' &&
      (1.05 / (luminance(primaryColor) + 0.05) < 4.5 || luminance(accentColor) < 0.5)
    )
      throw new PlatformError(
        400,
        'Scegli un colore principale più scuro e uno sfondo chiaro per mantenere leggibili i testi.',
      );
    const website = optional(body, 'website', 300);
    if (website) {
      let url: URL;
      try {
        url = new URL(website);
      } catch {
        throw new PlatformError(400, 'Sito web non valido.');
      }
      if (url.protocol !== 'https:') throw new PlatformError(400, 'Usa un sito HTTPS.');
    }
    let imageKey = previous?.imageKey ?? null;
    if (body.imageBase64 !== undefined || body.removeImage === true) {
      if (
        kind === 'club' &&
        !permission.federal &&
        previous?.imageKey &&
        previous.imageSource === 'federation'
      )
        throw new PlatformError(
          403,
          'Il logo federale può essere sostituito soltanto dalla federazione.',
        );
      if (body.removeImage === true) imageKey = null;
      else {
        if (
          typeof body.imageBase64 !== 'string' ||
          body.imageBase64.length > 700000 ||
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.imageBase64)
        )
          throw new PlatformError(400, 'Carica PNG, JPEG o WebP entro 500 KB.');
        let bytes: Buffer;
        try {
          const input = Buffer.from(body.imageBase64.split(',')[1], 'base64');
          if (input.length > 512000) throw new Error('size');
          const image = sharp(input, { limitInputPixels: 16000000, animated: false });
          const meta = await image.metadata();
          if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
            throw new Error('format');
          bytes = await image
            .rotate()
            .resize(320, 320, {
              fit: kind === 'referee' ? 'cover' : 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 0 },
            })
            .webp({ quality: 82 })
            .toBuffer();
        } catch {
          throw new PlatformError(400, 'Immagine non valida.');
        }
        imageKey = `identity-profiles/${kind}/${id}/${randomUUID()}.webp`;
        await this.app.objectStores.photos.putObject(imageKey, bytes);
      }
    }
    const row = await this.db.put<IdentityProfile>('identity_profiles', {
      kind,
      subjectId: id,
      id: this.key(kind, id),
      revision: (previous?.revision ?? 0) + 1,
      displayName: optional(body, 'displayName', 120) || permission.name,
      description: optional(body, 'description', 1000),
      website,
      primaryColor,
      accentColor,
      imageKey,
      imageSource:
        body.imageBase64 !== undefined || body.removeImage === true
          ? permission.federal
            ? 'federation'
            : 'owner'
          : (previous?.imageSource ?? 'owner'),
    });
    return this.getProfile(row.kind, id);
  }
  async contextProfiles() {
    const targets = new Map<string, { kind: ProfileKind; id: string }>(),
      add = (kind: ProfileKind, id: string) => targets.set(this.key(kind, id), { kind, id });
    for (const id of this.auth.federationIds ?? []) add('organization', id);
    for (const id of this.auth.clubIds ?? []) {
      add('club', id);
      const club = await this.app.repositories.clubs.findById(id);
      if (club) add('organization', club.federationId);
    }
    for (const id of this.auth.refereeIds ?? []) {
      add('referee', id);
      const referee = await this.app.repositories.referees.findById(id);
      if (referee) add('organization', referee.federationId);
    }
    for (const row of await this.db.find<Membership>('memberships', {
      actorId: this.auth.actorId,
      active: true,
    }))
      add('organization', row.organizationId);
    const items = [];
    for (const target of targets.values()) {
      try {
        items.push(await this.getProfile(target.kind, target.id));
      } catch (error) {
        if (!(error instanceof PlatformError && [403, 404].includes(error.status))) throw error;
      }
    }
    return { items };
  }
}
