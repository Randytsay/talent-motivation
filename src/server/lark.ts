import type { RuntimeConfig } from './env';
import { randomUUID } from 'node:crypto';
import { HttpError } from './http';
import { normalizeRiasecScore } from '../lib/scoring/riasec';
import type { AIReport, AssessmentRecord, EventRecord, Participant } from './contracts';
import type { AIReportsRepository, AssessmentsRepository, EventsRepository, ParticipantsRepository, Repositories } from './repositories';
import type { RiasecCode } from '../types/domain';
import type { SubjectRecord } from './subject';

export interface LarkFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** Server-only, small Lark Base client. Table schemas are supplied via env IDs. */
export class LarkOpenApiClient {
  constructor(
    private readonly lark: NonNullable<RuntimeConfig['lark']>,
    private readonly fetcher: LarkFetch = fetch,
  ) {}

  async createRecord(tableId: string, fields: Record<string, unknown>): Promise<{ recordId: string }> {
    const token = await this.tenantAccessToken();
    const response = await this.fetcher(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(this.lark.baseAppToken)}/tables/${encodeURIComponent(tableId)}/records`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ fields }),
      },
    );
    const body = (await response.json().catch(() => null)) as { code?: number; data?: { record?: { record_id?: string } } } | null;
    if (!response.ok || body?.code) throw new HttpError(502, 'lark_write_failed', '資料儲存服務暫時無法使用。');
    const recordId = body?.data?.record?.record_id;
    if (!recordId) throw new HttpError(502, 'lark_invalid_response', '資料儲存服務回傳格式無效。');
    return { recordId };
  }

  async updateRecord(tableId: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
    const token = await this.tenantAccessToken();
    const response = await this.fetcher(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(this.lark.baseAppToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
      { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields }) },
    );
    const body = (await response.json().catch(() => null)) as { code?: number } | null;
    if (!response.ok || body?.code) throw new HttpError(502, 'lark_write_failed', '資料儲存服務暫時無法使用。');
  }

  async listRecords(tableId: string): Promise<Array<{ recordId: string; fields: Record<string, unknown> }>> {
    const token = await this.tenantAccessToken();
    const records: Array<{ recordId: string; fields: Record<string, unknown> }> = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(this.lark.baseAppToken)}/tables/${encodeURIComponent(tableId)}/records`);
      url.searchParams.set('page_size', '500');
      if (pageToken) url.searchParams.set('page_token', pageToken);
      const response = await this.fetcher(url, { headers: { authorization: `Bearer ${token}` } });
      const body = (await response.json().catch(() => null)) as {
        code?: number; data?: { items?: Array<{ record_id?: string; fields?: Record<string, unknown> }>; has_more?: boolean; page_token?: string };
      } | null;
      if (!response.ok || body?.code) throw new HttpError(502, 'lark_read_failed', '資料儲存服務暫時無法使用。');
      records.push(...(body?.data?.items ?? []).flatMap((item) => item.record_id && item.fields ? [{ recordId: item.record_id, fields: item.fields }] : []));
      pageToken = body?.data?.has_more ? body.data.page_token : undefined;
      if (body?.data?.has_more && !pageToken) throw new HttpError(502, 'lark_invalid_response', '資料儲存服務回傳格式無效。');
    } while (pageToken);
    return records;
  }

  private async tenantAccessToken(): Promise<string> {
    const response = await this.fetcher('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: this.lark.appId, app_secret: this.lark.appSecret }),
    });
    const body = (await response.json().catch(() => null)) as { code?: number; tenant_access_token?: string } | null;
    if (!response.ok || body?.code || !body?.tenant_access_token) {
      throw new HttpError(502, 'lark_auth_failed', '資料儲存服務驗證失敗。');
    }
    return body.tenant_access_token;
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function date(value: unknown): string {
  return asString(value) ?? new Date(0).toISOString();
}

type Tables = NonNullable<RuntimeConfig['lark']>;

/**
 * Lark Base repository implementation. Field names mirror TECHNICAL_SPEC.md;
 * write operations are append-only for assessments and use no browser data.
 */
export class LarkRepositories implements Repositories {
  readonly participants: ParticipantsRepository;
  readonly subjects: Repositories['subjects'];
  readonly assessments: AssessmentsRepository;
  readonly reports: AIReportsRepository;
  readonly events: EventsRepository;

  constructor(private readonly client: LarkOpenApiClient, private readonly tables: Tables) {
    this.participants = {
      findByLineUserId: async (lineUserId) => {
        const row = (await this.client.listRecords(this.tables.participantsTableId)).find((item) => item.fields.line_user_id === lineUserId);
        return row ? participantFrom(row.fields) : null;
      },
      findByParticipantId: async (participantId) => {
        const row = (await this.client.listRecords(this.tables.participantsTableId)).find((item) => item.fields.participant_id === participantId);
        return row ? participantFrom(row.fields) : null;
      },
      upsertIdentity: async (identity) => {
        const rows = await this.client.listRecords(this.tables.participantsTableId);
        const existing = rows.find((item) => item.fields.line_user_id === identity.lineUserId);
        const timestamp = new Date().toISOString();
        if (existing) {
          await this.client.updateRecord(this.tables.participantsTableId, existing.recordId, {
            display_name: identity.displayName, picture_url: identity.pictureUrl ?? '', last_seen_at: timestamp,
          });
          return participantFrom({ ...existing.fields, ...identity, display_name: identity.displayName, picture_url: identity.pictureUrl, last_seen_at: timestamp });
        }
        const participant: Participant = {
          participantId: randomUUID(), ...identity, createdAt: timestamp, lastSeenAt: timestamp,
        };
        await this.client.createRecord(this.tables.participantsTableId, participantFields(participant));
        return participant;
      },
      setLatestAssessment: async (participantId, assessmentId) => {
        const row = (await this.client.listRecords(this.tables.participantsTableId)).find((item) => item.fields.participant_id === participantId);
        if (!row) throw new HttpError(404, 'participant_not_found', '找不到參與者資料。');
        await this.client.updateRecord(this.tables.participantsTableId, row.recordId, { latest_assessment_id: assessmentId, last_seen_at: new Date().toISOString() });
      },
    };
    this.assessments = {
      append: async (assessment) => {
        await this.client.createRecord(this.tables.assessmentsTableId, assessmentFields(assessment));
        return assessment;
      },
      findById: async (assessmentId) => {
        const row = (await this.client.listRecords(this.tables.assessmentsTableId)).find((item) => item.fields.assessment_id === assessmentId);
        return row ? assessmentFrom(row.fields) : null;
      },
      findLatestForParticipant: async (participantId) => {
        const rows = (await this.client.listRecords(this.tables.assessmentsTableId))
          .filter((item) => item.fields.participant_id === participantId)
          .sort((left, right) => date(right.fields.completed_at).localeCompare(date(left.fields.completed_at)));
        return rows[0] ? assessmentFrom(rows[0].fields) : null;
      },
      listForSubject: async (subjectId) => {
        const rows = (await this.client.listRecords(this.tables.assessmentsTableId))
          .filter((item) => item.fields.subject_id === subjectId)
          .sort((left, right) => date(right.fields.completed_at).localeCompare(date(left.fields.completed_at)));
        return rows.map((row) => assessmentFrom(row.fields));
      },
    };
    this.reports = {
      save: async (report) => {
        await this.client.createRecord(this.tables.aiReportsTableId, {
          report_id: report.reportId, assessment_id: report.assessmentId, repeated_signals: report.repeated_signals.join('\n'),
          birth_profile_summary: report.birth_profile_summary, motivator_summary: report.motivator_summary, possible_tensions: report.possible_tensions.join('\n'),
          unused_potential: report.unused_potential,
          exploration_directions: report.exploration_directions.join('\n'), reflection_question: report.reflection_question,
          summary: report.summary, report_json: JSON.stringify(report), prompt_version: report.promptVersion,
          model_name: report.modelName, generated_at: report.generatedAt,
        });
        return report;
      },
      findByAssessmentId: async (assessmentId) => {
        const row = (await this.client.listRecords(this.tables.aiReportsTableId)).find((item) => item.fields.assessment_id === assessmentId);
        if (!row) return null;
        const serialized = asString(row.fields.report_json);
        if (!serialized) return null;
        try {
          const parsed = JSON.parse(serialized) as Partial<AIReport>;
          return {
            ...parsed,
            birth_profile_summary: parsed.birth_profile_summary ?? '出生結構可作為觀察自己的象徵語言，請與實際經驗一起理解。',
            unused_potential: parsed.unused_potential ?? '可以從一個小任務開始觀察天賦使用感的變化。',
          } as AIReport;
        } catch { throw new HttpError(502, 'lark_invalid_response', 'AI 報告資料格式無效。'); }
      },
    };
    this.events = {
      findById: async (eventId) => {
        const row = (await this.client.listRecords(this.tables.eventsTableId)).find((item) => item.fields.event_id === eventId);
        return row ? eventFrom(row.fields) : null;
      },
      setCurrentPresenterAssessment: async (eventId, assessmentId) => {
        const row = (await this.client.listRecords(this.tables.eventsTableId)).find((item) => item.fields.event_id === eventId);
        if (!row) throw new HttpError(404, 'event_not_found', '找不到活動資料。');
        await this.client.updateRecord(this.tables.eventsTableId, row.recordId, { current_presenter_assessment: assessmentId });
      },
    };
    this.subjects = {
      create: async (subject) => {
        const tableId = this.tables.subjectsTableId;
        if (!tableId) throw new HttpError(503, 'configuration_required', 'Subjects 資料表尚未完成設定。');
        await this.client.createRecord(tableId, subjectFields(subject));
        return subject;
      },
      findById: async (subjectId) => {
        const rows = await this.subjectRows();
        const row = rows.find((item) => item.fields.subject_id === subjectId);
        return row ? subjectFrom(row.fields) : null;
      },
      findByClaimTokenHash: async (tokenHash) => {
        const rows = await this.subjectRows();
        const row = rows.find((item) => item.fields.claim_token_hash === tokenHash);
        return row ? subjectFrom(row.fields) : null;
      },
      findSelfForParticipant: async (participantId) => {
        const rows = await this.subjectRows();
        const row = rows.find((item) => item.fields.created_by_participant_id === participantId && item.fields.subject_kind === 'self' && item.fields.archived !== true);
        return row ? subjectFrom(row.fields) : null;
      },
      listForParticipant: async (participantId) => {
        const rows = await this.subjectRows();
        return rows.filter((item) => {
          const fields = item.fields;
          return fields.archived !== true && (fields.owner_participant_id === participantId ||
            (fields.claim_status === 'unclaimed' && fields.created_by_participant_id === participantId));
        }).map((row) => subjectFrom(row.fields));
      },
      update: async (subjectId, patch) => {
        const tableId = this.tables.subjectsTableId;
        if (!tableId) throw new HttpError(503, 'configuration_required', 'Subjects 資料表尚未完成設定。');
        const rows = await this.subjectRows();
        const row = rows.find((item) => item.fields.subject_id === subjectId);
        if (!row) throw new HttpError(404, 'subject_not_found', '找不到這個探索對象。');
        const updated = { ...subjectFrom(row.fields), ...patch, subjectId, updatedAt: patch.updatedAt ?? new Date().toISOString() };
        await this.client.updateRecord(tableId, row.recordId, subjectFields(updated));
        return updated;
      },
      setLastAssessment: async (subjectId, assessmentId) => {
        await this.subjects.update(subjectId, { lastAssessmentId: assessmentId });
      },
    };
  }

  private async subjectRows(): Promise<Array<{ recordId: string; fields: Record<string, unknown> }>> {
    if (!this.tables.subjectsTableId) return [];
    return this.client.listRecords(this.tables.subjectsTableId);
  }
}

function participantFields(participant: Participant): Record<string, unknown> {
  return {
    participant_id: participant.participantId, line_user_id: participant.lineUserId, display_name: participant.displayName,
    picture_url: participant.pictureUrl ?? '', latest_assessment_id: participant.latestAssessmentId ?? '',
    created_at: participant.createdAt, last_seen_at: participant.lastSeenAt,
  };
}

function participantFrom(fields: Record<string, unknown>): Participant {
  const participantId = asString(fields.participant_id);
  const lineUserId = asString(fields.line_user_id);
  const displayName = asString(fields.display_name);
  if (!participantId || !lineUserId || !displayName) throw new HttpError(502, 'lark_invalid_response', '參與者資料格式無效。');
  const pictureUrl = asString(fields.picture_url);
  const latestAssessmentId = asString(fields.latest_assessment_id);
  return {
    participantId, lineUserId, displayName, ...(pictureUrl ? { pictureUrl } : {}), ...(latestAssessmentId ? { latestAssessmentId } : {}),
    createdAt: date(fields.created_at), lastSeenAt: date(fields.last_seen_at),
  };
}

function assessmentFields(assessment: AssessmentRecord): Record<string, unknown> {
  const scores = assessment.riasecResult.scores;
  return {
    assessment_id: assessment.assessmentId, participant_id: assessment.participantId, event_id: assessment.eventId ?? '', completed_at: assessment.completedAt,
    life_path: assessment.lifePath.value, life_path_resonance: assessment.lifePathResonance, life_path_top_resonance: assessment.lifePathTopResonance,
    ...assessment.riasecAnswers,
    r_score: scores.R.raw, i_score: scores.I.raw, a_score: scores.A.raw, s_score: scores.S.raw, e_score: scores.E.raw, c_score: scores.C.raw,
    top1: assessment.riasecResult.top3[0], top2: assessment.riasecResult.top3[1], top3: assessment.riasecResult.top3[2], top3_code: assessment.riasecResult.top3Code,
    self_energy_choice: assessment.subjectiveDriver, talent_usage_pct: assessment.talentUsage,
    priority_1: assessment.priorities[0], priority_2: assessment.priorities[1] ?? '', exploration_interest: assessment.explorationInterest,
    presenter_consent: assessment.presenterConsent, presenter_consent_at: assessment.presenterConsentAt ?? '',
    subject_id: assessment.subjectId ?? '', created_by_participant_id: assessment.createdByParticipantId ?? assessment.participantId,
    assessment_mode: assessment.assessmentMode ?? 'self',
    birth_profile_json: assessment.birthProfile ? JSON.stringify(assessment.birthProfile) : '',
    birth_signature_json: assessment.birthSignature ? JSON.stringify(assessment.birthSignature) : '',
    birth_pyramid_main: assessment.birthProfile?.pyramid.main ?? '',
    birth_outer_composite: assessment.birthProfile?.pyramid.outerComposite ?? '',
    birth_inner_composite: assessment.birthProfile?.pyramid.innerComposite ?? '',
    birth_current_stage: assessment.birthProfile?.currentStage.key ?? '',
    birth_current_stage_number: assessment.birthProfile?.currentStage.number ?? '',
    age_band: assessment.birthProfile?.ageBand ?? '',
    reflection_energizing: assessment.reflections?.energizingExperience ?? '',
    reflection_friction: assessment.reflections?.currentFriction ?? '',
    reflection_exploration: assessment.reflections?.unconstrainedExploration ?? '',
  };
}

function assessmentFrom(fields: Record<string, unknown>): AssessmentRecord {
  const codes: RiasecCode[] = ['R', 'I', 'A', 'S', 'E', 'C'];
  const answers = Object.fromEntries(Array.from({ length: 18 }, (_, index) => {
    const key = `q${String(index + 1).padStart(2, '0')}` as `q${string}`;
    return [key, asNumber(fields[key])];
  })) as Record<`q${string}`, 1 | 2 | 3 | 4>;
  const scores = Object.fromEntries(codes.map((code) => {
    const raw = asNumber(fields[`${code.toLowerCase()}_score`]);
    if (!raw || raw < 3 || raw > 12) throw new HttpError(502, 'lark_invalid_response', 'RIASEC 分數資料格式無效。');
    return [code, { code, raw, normalized: normalizeRiasecScore(raw) }];
  })) as AssessmentRecord['riasecResult']['scores'];
  const top3 = [asString(fields.top1), asString(fields.top2), asString(fields.top3)] as RiasecCode[];
  const assessmentId = asString(fields.assessment_id);
  const participantId = asString(fields.participant_id);
  const lifePath = asNumber(fields.life_path);
  if (!assessmentId || !participantId || !lifePath || !top3.every((code) => codes.includes(code))) throw new HttpError(502, 'lark_invalid_response', '測驗資料格式無效。');
  const birthProfile = parseJson(fields.birth_profile_json) as AssessmentRecord['birthProfile'];
  const birthSignature = parseJson(fields.birth_signature_json) as AssessmentRecord['birthSignature'];
  const reflections = asString(fields.reflection_energizing)
    ? {
      energizingExperience: asString(fields.reflection_energizing)!,
      ...((asString(fields.reflection_friction) ?? '').trim() ? { currentFriction: asString(fields.reflection_friction) } : {}),
      ...((asString(fields.reflection_exploration) ?? '').trim() ? { unconstrainedExploration: asString(fields.reflection_exploration) } : {}),
    }
    : undefined;
  return {
    assessmentId, participantId, eventId: asString(fields.event_id) || undefined,
    // Birth date belongs to the private Participants table. The result already has its deterministic life-path value.
    birthDate: '', lifePath: { value: lifePath as AssessmentRecord['lifePath']['value'], rawDigitSum: 0, reductionSteps: [] },
    ...(asString(fields.subject_id) ? { subjectId: asString(fields.subject_id) } : {}),
    ...(asString(fields.created_by_participant_id) ? { createdByParticipantId: asString(fields.created_by_participant_id) } : {}),
    ...(asString(fields.assessment_mode) ? { assessmentMode: asString(fields.assessment_mode) as AssessmentRecord['assessmentMode'] } : {}),
    ...(birthProfile ? { birthProfile } : {}), ...(birthSignature ? { birthSignature } : {}),
    lifePathResonance: asString(fields.life_path_resonance) as AssessmentRecord['lifePathResonance'],
    lifePathTopResonance: asString(fields.life_path_top_resonance) ?? '', riasecAnswers: answers,
    riasecResult: { scores, top3, top3Code: asString(fields.top3_code) ?? top3.join('') },
    subjectiveDriver: asString(fields.self_energy_choice) as RiasecCode, talentUsage: asNumber(fields.talent_usage_pct) as AssessmentRecord['talentUsage'],
    priorities: [asString(fields.priority_1), asString(fields.priority_2)].filter(Boolean) as AssessmentRecord['priorities'],
    explorationInterest: asString(fields.exploration_interest) as AssessmentRecord['explorationInterest'],
    reflections, presenterConsent: fields.presenter_consent === true || fields.presenter_consent === 'true' || fields.presenter_consent === 1, presenterConsentAt: asString(fields.presenter_consent_at) || undefined, completedAt: date(fields.completed_at),
  };
}

function parseJson(value: unknown): unknown {
  const serialized = asString(value);
  if (!serialized) return undefined;
  try { return JSON.parse(serialized); } catch { return undefined; }
}

function subjectFields(subject: SubjectRecord): Record<string, unknown> {
  return {
    subject_id: subject.subjectId, owner_participant_id: subject.ownerParticipantId ?? '', created_by_participant_id: subject.createdByParticipantId,
    subject_kind: subject.subjectKind, display_label: subject.displayLabel, birth_date: subject.birthDate, claim_status: subject.claimStatus,
    claim_token_hash: subject.claimTokenHash ?? '', claim_expires_at: subject.claimExpiresAt ?? '', claimed_at: subject.claimedAt ?? '',
    last_assessment_id: subject.lastAssessmentId ?? '', created_at: subject.createdAt, updated_at: subject.updatedAt, archived: subject.archived,
  };
}

function subjectFrom(fields: Record<string, unknown>): SubjectRecord {
  const subjectId = asString(fields.subject_id);
  const createdByParticipantId = asString(fields.created_by_participant_id);
  const subjectKind = asString(fields.subject_kind);
  const displayLabel = asString(fields.display_label);
  const birthDate = asString(fields.birth_date);
  const claimStatus = asString(fields.claim_status);
  if (!subjectId || !createdByParticipantId || !displayLabel || !birthDate || !subjectKind || !claimStatus) throw new HttpError(502, 'lark_invalid_response', '探索對象資料格式無效。');
  if (!['self', 'guest', 'claimed'].includes(subjectKind) || !['not_applicable', 'unclaimed', 'claimed', 'expired', 'revoked'].includes(claimStatus)) throw new HttpError(502, 'lark_invalid_response', '探索對象資料格式無效。');
  return {
    subjectId, ...(asString(fields.owner_participant_id) ? { ownerParticipantId: asString(fields.owner_participant_id) } : {}), createdByParticipantId,
    subjectKind: subjectKind as SubjectRecord['subjectKind'], displayLabel, birthDate, claimStatus: claimStatus as SubjectRecord['claimStatus'],
    ...(asString(fields.claim_token_hash) ? { claimTokenHash: asString(fields.claim_token_hash) } : {}), ...(asString(fields.claim_expires_at) ? { claimExpiresAt: asString(fields.claim_expires_at) } : {}),
    ...(asString(fields.claimed_at) ? { claimedAt: asString(fields.claimed_at) } : {}), ...(asString(fields.last_assessment_id) ? { lastAssessmentId: asString(fields.last_assessment_id) } : {}),
    createdAt: date(fields.created_at), updatedAt: date(fields.updated_at), archived: fields.archived === true || fields.archived === 'true' || fields.archived === 1,
  };
}

function eventFrom(fields: Record<string, unknown>): EventRecord {
  const eventId = asString(fields.event_id);
  const status = asString(fields.status);
  if (!eventId || (status !== 'draft' && status !== 'active' && status !== 'closed')) throw new HttpError(502, 'lark_invalid_response', '活動資料格式無效。');
  return {
    eventId, eventCode: asString(fields.event_code) ?? '', eventName: asString(fields.event_name) ?? '', status,
    currentPresenterAssessmentId: asString(fields.current_presenter_assessment) || undefined, createdAt: date(fields.created_at),
  };
}
