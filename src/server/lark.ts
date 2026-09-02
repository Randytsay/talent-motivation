import type { RuntimeConfig } from './env';
import { randomUUID } from 'node:crypto';
import { HttpError } from './http';
import { normalizeRiasecScore } from '../lib/scoring/riasec';
import type { AIReport, AssessmentRecord, EventRecord, Participant } from './contracts';
import type { AIReportsRepository, AssessmentsRepository, EventsRepository, ParticipantsRepository, Repositories } from './repositories';
import type { RiasecCode } from '../types/domain';

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
    };
    this.reports = {
      save: async (report) => {
        await this.client.createRecord(this.tables.aiReportsTableId, {
          report_id: report.reportId, assessment_id: report.assessmentId, repeated_signals: report.repeated_signals.join('\n'),
          motivator_summary: report.motivator_summary, possible_tensions: report.possible_tensions.join('\n'),
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
        try { return JSON.parse(serialized) as AIReport; } catch { throw new HttpError(502, 'lark_invalid_response', 'AI 報告資料格式無效。'); }
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
  return {
    assessmentId, participantId, eventId: asString(fields.event_id) || undefined,
    // Birth date belongs to the private Participants table. The result already has its deterministic life-path value.
    birthDate: '', lifePath: { value: lifePath as AssessmentRecord['lifePath']['value'], rawDigitSum: 0, reductionSteps: [] },
    lifePathResonance: asString(fields.life_path_resonance) as AssessmentRecord['lifePathResonance'],
    lifePathTopResonance: asString(fields.life_path_top_resonance) ?? '', riasecAnswers: answers,
    riasecResult: { scores, top3, top3Code: asString(fields.top3_code) ?? top3.join('') },
    subjectiveDriver: asString(fields.self_energy_choice) as RiasecCode, talentUsage: asNumber(fields.talent_usage_pct) as AssessmentRecord['talentUsage'],
    priorities: [asString(fields.priority_1), asString(fields.priority_2)].filter(Boolean) as AssessmentRecord['priorities'],
    explorationInterest: asString(fields.exploration_interest) as AssessmentRecord['explorationInterest'],
    presenterConsent: fields.presenter_consent === true, presenterConsentAt: asString(fields.presenter_consent_at) || undefined, completedAt: date(fields.completed_at),
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
