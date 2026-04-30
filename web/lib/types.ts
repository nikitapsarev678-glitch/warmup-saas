export interface SaasUser {
  id: number
  telegram_id: number
  telegram_username: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  plan: 'free' | 'starter' | 'basic' | 'pro' | 'agency'
  plan_expires_at: string | null
  accounts_limit: number
  created_at: string
}

export interface Project {
  id: number
  user_id: number
  name: string
  created_at: string
}

export interface TgAccount {
  id: number
  user_id: number
  phone: string
  first_name: string | null
  username: string | null
  status: 'pending' | 'active' | 'warming' | 'warmed' | 'spam_block' | 'banned' | 'disabled'
  proxy: string | null
  project_id: number | null
  block_reason: string | null
  messages_sent: number
  daily_limit: number
  hourly_limit: number
  group_limit: number
  dm_limit: number
  pause_until: string | null
  spambot_status: 'clean' | 'spam' | 'unknown' | null
  spambot_checked_at: string | null
  bio: string | null
  tg_id: number | null
  auto_warmup_enabled: number
  auto_warmup_config: string | null
  created_at: string
}

export interface Campaign {
  id: number
  user_id: number
  name: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  warmup_days: number
  daily_actions_min: number
  daily_actions_max: number
  work_hour_start: number
  work_hour_end: number
  actions_config: string
  use_pool_dialogs: number
  project_id: number | null
  ai_dialog_enabled: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface TokenPackage {
  id: number
  tokens: number
  price_rub: number
  label: string
  is_active: number
}

export interface TokenTransaction {
  id: number
  user_id: number
  amount: number
  reason: string
  ref_id: string | null
  balance_after: number
  created_at: string
}

export type AccountImportSourceType = 'tdata_zip' | 'session_json_zip' | 'string_session_txt'
export type AccountImportJobStatus = 'pending' | 'uploaded' | 'queued' | 'running' | 'action_required' | 'done' | 'error'

export interface AccountImportStats {
  found: number
  imported: number
  errors: number
  skipped?: number
}

export interface AccountImportAction {
  type: 'code' | '2fa' | 'password'
  hint: string
}

export interface AccountImportJob {
  id: number
  project_id: number | null
  source_type: AccountImportSourceType
  status: AccountImportJobStatus
  stats: AccountImportStats | null
  action: AccountImportAction | null
  error: string | null
  created_at: string
}

export interface Lead {
  id: number
  user_id: number
  project_id: number | null
  telegram_id: number | null
  username: string | null
  title: string | null
  source: string | null
  status: 'active' | 'replied' | 'blocked'
  created_at: string
}

export interface ParsingProgress {
  groups_found: number
  groups_processed: number
  admins_found: number
  participants_found: number
  leads_added: number
  leads_skipped: number
  tokens_spent: number
}

export interface ParsingJob {
  id: number
  project_id: number | null
  status: 'queued' | 'running' | 'paused' | 'completed' | 'error'
  query: string
  geo: string | null
  limit: number
  classify_with_ai: boolean
  progress: ParsingProgress
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ParsingStartPayload {
  project_id: number | null
  query: string
  geo: string | null
  limit: number
  classify_with_ai: boolean
}

export interface ParsingStartResponse {
  ok: boolean
  job: ParsingJob | null
}

export interface ParsingJobResponse {
  job: ParsingJob
}

export interface ParsingResultResponse {
  job: ParsingJob
  summary: ParsingProgress
  leads: Lead[]
}

export interface ParsingJobsListResponse {
  jobs: ParsingJob[]
}

export const DEFAULT_PARSING_FORM: ParsingStartPayload = {
  project_id: null,
  query: '',
  geo: null,
  limit: 25,
  classify_with_ai: false,
}

export const PARSING_STATUS_LABELS: Record<ParsingJob['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: 'В очереди', variant: 'outline' },
  running: { label: 'Идёт', variant: 'default' },
  paused: { label: 'На паузе', variant: 'secondary' },
  completed: { label: 'Завершён', variant: 'secondary' },
  error: { label: 'Ошибка', variant: 'destructive' },
}

export function normalizeParsingPayload(payload: ParsingStartPayload): ParsingStartPayload {
  return {
    project_id: payload.project_id,
    query: payload.query.trim(),
    geo: payload.geo?.trim() || null,
    limit: payload.limit,
    classify_with_ai: payload.classify_with_ai,
  }
}

export function canPollParsingJob(job: ParsingJob | null | undefined) {
  return Boolean(job && ['queued', 'running'].includes(job.status))
}

export function formatParsingActivityDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU')
}

export function buildParsingSummaryLabel(progress: ParsingProgress) {
  return `${progress.leads_added} лидов · ${progress.tokens_spent} токенов`
}

export function buildParsingProjectPayload(projectId: string) {
  return projectId === 'none' ? null : Number(projectId)
}

export function buildParsingLimit(value: string) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 25
}

export interface BroadcastLimits {
  daily_limit_per_account: number
  interval_min_seconds: number
  interval_max_seconds: number
}

export interface BroadcastSettings {
  followup_day3_enabled: boolean
  followup_day3_message: string | null
  followup_day7_enabled: boolean
  followup_day7_message: string | null
}

export interface Broadcast {
  id: number
  user_id: number
  project_id: number | null
  name: string
  status: 'draft' | 'queued' | 'running' | 'paused' | 'completed' | 'error'
  target_mode: 'dm' | 'groups_or_channels'
  message_variants_json: string
  limits_json: string | null
  settings_json: string | null
  account_ids?: number[]
  message_variants?: string[]
  limits?: BroadcastLimits | null
  settings?: BroadcastSettings | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface BroadcastProgressSummary {
  leads_total: number
  total_events: number
  sent: number
  failed: number
  skipped: number
  followups_pending: number
  followups_cancelled: number
}

export interface BroadcastLog {
  id: number
  step: number
  status: 'queued' | 'sent' | 'skipped' | 'failed'
  error: string | null
  sent_at: string | null
  created_at: string
  account_id: number | null
  username: string | null
  telegram_id: number | null
  title: string | null
}

export interface BroadcastFollowup {
  step: number
  status: 'pending' | 'queued' | 'done' | 'cancelled'
  due_at: string
  completed_at: string | null
}

export interface BroadcastProgress {
  broadcast: Broadcast
  summary: BroadcastProgressSummary
  followups: BroadcastFollowup[]
}

export interface BroadcastFormPayload {
  name: string
  project_id: number | null
  target_mode: 'dm' | 'groups_or_channels'
  account_ids: number[]
  message_variants: string[]
  daily_limit_per_account: number
  interval_min_seconds: number
  interval_max_seconds: number
  followup_day3_enabled: boolean
  followup_day3_message: string | null
  followup_day7_enabled: boolean
  followup_day7_message: string | null
}

export interface LeadImportPayload {
  project_id: number | null
  raw: string
}

export interface LeadImportResult {
  ok: true
  imported: number
  skipped: number
  total: number
}

export interface BroadcastCreateResult {
  ok: true
  broadcast_id: number
}

export interface BroadcastActionResult {
  ok: true
}

export interface BroadcastListResponse {
  broadcasts: Broadcast[]
}

export interface LeadsListResponse {
  leads: Lead[]
}

export interface BroadcastLogsResponse {
  logs: BroadcastLog[]
}

export type BroadcastProgressResponse = BroadcastProgress

export interface ProjectsResponse {
  projects: Project[]
}

export interface AccountsResponse {
  accounts: TgAccount[]
}

export interface NotificationSettings {
  tokens_zero_enabled: boolean
  account_spam_block_enabled: boolean
  account_banned_enabled: boolean
  batch_check_complete_enabled: boolean
}

export interface FeatureFlags {
  ai_parsing_enabled: boolean
  ai_dialogs_enabled: boolean
  group_broadcasts_enabled: boolean
}

export interface NotificationSettingsResponse {
  settings: NotificationSettings
  feature_flags: FeatureFlags
}

export interface NotificationSettingsUpdateResponse {
  ok: true
  settings: NotificationSettings
  feature_flags: FeatureFlags
}

export interface RunnerErrorLog {
  id: number
  action: string
  error: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  campaign_id: number
}

export interface RunnerErrorsResponse {
  errors: RunnerErrorLog[]
}

export function getRunnerActionLabel(action: string) {
  const labels: Record<string, string> = {
    run_warmup_day: 'Прогрев кампании',
    send_broadcast: 'Рассылка',
    send_followups: 'Follow-up',
    import_accounts: 'Импорт аккаунтов',
    check_proxies: 'Проверка прокси',
    run_parsing: 'AI-парсинг',
    check_spambot: 'SpamBot check',
  }

  return labels[action] ?? action
}

export function formatRunnerErrorDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU')
}

export function getRunnerErrorHint(action: string) {
  const hints: Record<string, string> = {
    run_warmup_day: 'Проверьте статус кампании, баланс токенов и активность sender-аккаунтов.',
    send_broadcast: 'Проверьте список лидов, доступность аккаунтов и лимиты рассылки.',
    send_followups: 'Убедитесь, что follow-up сообщения включены и базовая рассылка завершилась корректно.',
    import_accounts: 'Проверьте архив, формат импорта и доступность runner.',
    check_proxies: 'Проверьте валидность прокси и повторите проверку позже.',
    run_parsing: 'Проверьте лимит, запрос и баланс токенов перед повторным запуском.',
    check_spambot: 'Подождите завершения предыдущей проверки или попробуйте снова позже.',
  }

  return hints[action] ?? 'Проверьте входные данные и повторите действие позже.'
}

export function getRunnerErrorCta(action: string) {
  const ctas: Record<string, string> = {
    run_warmup_day: 'Откройте кампании и перезапустите задачу после проверки условий.',
    send_broadcast: 'Откройте broadcasts и повторите запуск после исправления причины.',
    send_followups: 'Проверьте broadcasts и статус follow-up шагов.',
    import_accounts: 'Повторите импорт после проверки архива.',
    check_proxies: 'Откройте прокси и запустите проверку ещё раз.',
    run_parsing: 'Откройте лиды и повторите AI-парсинг после исправления причины.',
    check_spambot: 'Откройте аккаунт и повторите SpamBot check позже.',
  }

  return ctas[action] ?? 'Повторите действие после устранения причины.'
}

export function summarizeProgressRatio(done: number, total: number) {
  if (total <= 0) return '—'
  const percent = Math.max(0, Math.min(100, Math.round((done / total) * 100)))
  return `${done}/${total} · ${percent}%`
}

export function estimateEtaFromRatio(done: number, total: number, unitLabel = 'этап') {
  if (total <= 0 || done >= total) return '—'
  return `Осталось ${total - done} ${unitLabel}`
}

export function getActionableErrorSuggestion(message: string | null | undefined) {
  const value = (message ?? '').toLowerCase()
  if (!value) return null
  if (value.includes('токен')) return 'Пополните токены и повторите запуск.'
  if (value.includes('runner')) return 'Проверьте runner и попробуйте снова позже.'
  if (value.includes('proxy')) return 'Проверьте прокси и повторите действие.'
  if (value.includes('lead')) return 'Добавьте лидов или проверьте источник аудитории.'
  if (value.includes('account')) return 'Проверьте доступность аккаунтов и их лимиты.'
  return 'Проверьте причину ошибки и повторите действие после исправления.'
}

export function getActionableErrorCta(message: string | null | undefined) {
  const value = (message ?? '').toLowerCase()
  if (!value) return 'Открыть настройки и проверить причину'
  if (value.includes('токен')) return 'Перейти к пополнению токенов'
  if (value.includes('proxy')) return 'Открыть прокси'
  if (value.includes('lead')) return 'Открыть лиды'
  if (value.includes('runner')) return 'Повторить позже'
  return 'Проверить и повторить'
}

export function getBroadcastHealthSummary(summary: BroadcastProgressSummary) {
  return `${summary.sent} отправлено · ${summary.failed} ошибок · ${summary.skipped} пропущено`
}

export function getParsingEta(progress: ParsingProgress) {
  if (progress.groups_found <= 0) return 'Собираем первые группы'
  if (progress.groups_processed >= progress.groups_found) return 'Финализируем результаты'
  return `Осталось групп: ${progress.groups_found - progress.groups_processed}`
}

export function getProxyHealthHint(status: string, latencyMs: number | null) {
  if (status === 'dead') return 'Замените прокси или исключите его из активных аккаунтов.'
  if (latencyMs !== null && latencyMs >= 1500) return 'Прокси отвечает медленно — проверьте его перед прогревом.'
  if (status === 'unknown') return 'Запустите проверку, чтобы понять, можно ли использовать этот прокси.'
  return 'Прокси выглядит рабочим и готов к использованию.'
}

export function getCampaignStatusInfo(status: Campaign['status'], errorMessage?: string | null) {
  switch (status) {
    case 'paused':
      return {
        reason: errorMessage ?? 'Кампания стоит на паузе.',
        nextAction: getActionableErrorSuggestion(errorMessage) ?? 'Проверьте причину паузы и запустите кампанию снова.',
      }
    case 'error':
      return {
        reason: errorMessage ?? 'Во время выполнения произошла ошибка.',
        nextAction: getActionableErrorSuggestion(errorMessage) ?? 'Исправьте причину и повторите запуск.',
      }
    case 'running':
      return {
        reason: 'Кампания активна и ожидает следующий цикл runner.',
        nextAction: 'Откройте прогресс, чтобы посмотреть обработанные аккаунты.',
      }
    default:
      return {
        reason: 'Кампания готова к запуску.',
        nextAction: 'Запустите её, когда аккаунты и токены готовы.',
      }
  }
}

export function getBroadcastStatusInfo(broadcast: Broadcast) {
  switch (broadcast.status) {
    case 'paused':
      return {
        reason: broadcast.error ?? 'Рассылка поставлена на паузу.',
        nextAction: getActionableErrorSuggestion(broadcast.error) ?? 'Исправьте причину и повторите запуск.',
      }
    case 'error':
      return {
        reason: broadcast.error ?? 'Во время рассылки произошла ошибка.',
        nextAction: getActionableErrorSuggestion(broadcast.error) ?? 'Проверьте детали и повторите позже.',
      }
    case 'queued':
      return {
        reason: 'Рассылка поставлена в очередь и ждёт ближайший poll runner.',
        nextAction: 'Подождите начала обработки или откройте логи.',
      }
    case 'running':
      return {
        reason: 'Рассылка активна и распределяет сообщения по аккаунтам.',
        nextAction: 'Следите за логами и количеством ошибок.',
      }
    default:
      return {
        reason: 'Рассылка готова к запуску после проверки лидов и sender-аккаунтов.',
        nextAction: 'Проверьте форму и нажмите запуск.',
      }
  }
}

export function getParsingStatusInfo(job: ParsingJob) {
  switch (job.status) {
    case 'paused':
      return {
        reason: job.error ?? 'Парсинг поставлен на паузу.',
        nextAction: getActionableErrorSuggestion(job.error) ?? 'Исправьте причину и повторите запуск.',
      }
    case 'error':
      return {
        reason: job.error ?? 'Во время парсинга произошла ошибка.',
        nextAction: getActionableErrorSuggestion(job.error) ?? 'Проверьте запрос и повторите позже.',
      }
    case 'queued':
      return {
        reason: 'Job стоит в очереди и ждёт свободный runner.',
        nextAction: 'Подождите начала обработки.',
      }
    case 'running':
      return {
        reason: 'Парсинг идёт и по мере продвижения добавляет лидов в базу.',
        nextAction: 'Следите за прогрессом групп и списанием токенов.',
      }
    default:
      return {
        reason: 'Job завершён и результаты уже записаны в базу.',
        nextAction: 'Проверьте импортированные лиды и запускайте outreach.',
      }
  }
}

export function getAccountEmptyState(projectsCount: number) {
  if (projectsCount > 0) {
    return 'Добавьте первый аккаунт или импортируйте архив, чтобы привязать его к проекту и запустить прогрев.'
  }

  return 'Добавьте первый аккаунт вручную или импортируйте архив, чтобы запустить прогрев.'
}

export function getLeadsEmptyState(projectsCount: number) {
  if (projectsCount > 0) {
    return 'Импортируйте лидов вручную или запустите AI-парсинг, чтобы наполнить проекты контактами для outreach.'
  }

  return 'Добавьте лидов вручную или через AI-парсинг, чтобы начать outreach-рассылки.'
}

export function getProxiesEmptyState() {
  return 'Добавьте первый прокси, затем запустите проверку alive/latency перед назначением аккаунтам.'
}

export function getCampaignsEmptyState(accountsCount: number) {
  if (accountsCount <= 0) {
    return 'Сначала подключите аккаунты, затем создайте первую кампанию прогрева.'
  }

  return 'Создайте первую кампанию прогрева и назначьте ей активные аккаунты.'
}

export function getBroadcastsEmptyState(leadsCount: number) {
  if (leadsCount <= 0) {
    return 'Сначала импортируйте лидов, затем создайте первую outreach-рассылку.'
  }

  return 'Создайте первую рассылку, выберите аккаунты-отправители и запустите outreach без дублей.'
}

export function getSettingsEmptyErrorsState() {
  return 'Системных ошибок runner пока нет — это хороший сигнал перед канареечным запуском.'
}

export function getProxyStatusTone(status: string, latencyMs: number | null) {
  if (status === 'dead') return 'destructive' as const
  if (latencyMs !== null && latencyMs >= 1500) return 'secondary' as const
  if (status === 'active') return 'default' as const
  return 'outline' as const
}

export function getCampaignProgressStats(accounts: Array<{ status?: string }>) {
  const total = accounts.length
  const done = accounts.filter((account) => account.status === 'done').length
  const errored = accounts.filter((account) => account.status === 'error').length
  return { total, done, errored }
}

export function getCampaignEtaText(total: number, done: number, errored: number) {
  if (total <= 0) return 'Нет аккаунтов в кампании'
  if (done + errored >= total) return 'Все аккаунты уже обработаны'
  return `Осталось аккаунтов: ${total - done - errored}`
}

export function getCampaignProgressLabel(total: number, done: number, errored: number) {
  return `${done} done · ${errored} error · ${Math.max(total - done - errored, 0)} pending`
}

export function getSettingsRunnerErrorTitle(count: number) {
  if (count === 0) return 'Ошибок runner нет'
  return `Последние ошибки runner: ${count}`
}

export function getBroadcastFollowupEta(pending: number) {
  if (pending <= 0) return 'Follow-up очередь пуста'
  return `Ожидают follow-up: ${pending}`
}

export function getLeadPipelineSummary(total: number, active: number, replied: number, blocked: number) {
  return `${active} активных · ${replied} ответили · ${blocked} недоступны из ${total}`
}

export function getParsingProgressRatio(progress: ParsingProgress) {
  return summarizeProgressRatio(progress.groups_processed, progress.groups_found)
}

export function getBroadcastProgressRatio(summary: BroadcastProgressSummary) {
  return summarizeProgressRatio(summary.total_events, summary.leads_total)
}

export function getProgressTone(ratioText: string) {
  if (ratioText === '—') return 'text-muted-foreground'
  return 'text-foreground'
}

export function getCampaignProgressTone(done: number, total: number) {
  if (total <= 0) return 'text-muted-foreground'
  if (done >= total) return 'text-green-600'
  return 'text-foreground'
}

export function getBroadcastErrorCountLabel(failed: number) {
  if (failed <= 0) return 'Без ошибок'
  return `${failed} с ошибкой`
}

export function getParsingTokenHint(tokensSpent: number) {
  if (tokensSpent <= 0) return 'Токены начнут списываться после первых результатов.'
  return `Уже списано ${tokensSpent} токенов по факту найденных лидов.`
}

export function getRunnerErrorSeverity(error: string) {
  const value = error.toLowerCase()
  if (value.includes('token') || value.includes('токен') || value.includes('unauthorized')) return 'high'
  if (value.includes('timeout') || value.includes('runner')) return 'medium'
  return 'low'
}

export function getRunnerErrorSeverityLabel(error: string) {
  const severity = getRunnerErrorSeverity(error)
  if (severity === 'high') return 'Высокий приоритет'
  if (severity === 'medium') return 'Нужно проверить'
  return 'Информационно'
}

export function getRunnerErrorSeverityVariant(error: string) {
  const severity = getRunnerErrorSeverity(error)
  if (severity === 'high') return 'destructive' as const
  if (severity === 'medium') return 'secondary' as const
  return 'outline' as const
}

export function getEmptyStateAction(path: 'billing' | 'leads' | 'proxies' | 'campaigns' | 'accounts' | 'broadcasts') {
  const map = {
    billing: '/billing',
    leads: '/leads',
    proxies: '/proxies',
    campaigns: '/campaigns/new',
    accounts: '/accounts',
    broadcasts: '/broadcasts',
  }

  return map[path]
}

export function getEmptyStateActionLabel(path: 'billing' | 'leads' | 'proxies' | 'campaigns' | 'accounts' | 'broadcasts') {
  const map = {
    billing: 'Открыть биллинг',
    leads: 'Открыть лиды',
    proxies: 'Открыть прокси',
    campaigns: 'Создать кампанию',
    accounts: 'Открыть аккаунты',
    broadcasts: 'Открыть рассылки',
  }

  return map[path]
}

export function getBroadcastAccountHint(count: number) {
  if (count <= 0) return 'Выберите хотя бы один sender-аккаунт.'
  return `Выбрано sender-аккаунтов: ${count}`
}

export function getCampaignReasonFromError(error: string | null | undefined) {
  return error ?? 'Причина пока не указана — проверьте статусы аккаунтов и runner.'
}

export function getBroadcastReasonFromError(error: string | null | undefined) {
  return error ?? 'Причина пока не указана — проверьте логи рассылки и статусы аккаунтов.'
}

export function getParsingReasonFromError(error: string | null | undefined) {
  return error ?? 'Причина пока не указана — проверьте запрос, лимит и статус runner.'
}

export function getSettingsRunnerErrorHint() {
  return 'Этот блок помогает увидеть последние системные сбои runner до того, как они превратятся в silent failure.'
}

export function getExplainablePausedStateLabel() {
  return 'Причина и следующее действие'
}

export function getExplainablePausedStateDescription(reason: string, nextAction: string) {
  return `${reason} ${nextAction}`
}

export function getRunnerErrorListLimitLabel() {
  return 'Показываем до 100 последних ошибок по текущему пользователю.'
}

export function getParsingEmptyJobState() {
  return 'Parsing jobs ещё не запускались. Создайте первый запрос, чтобы наполнить базу лидов автоматически.'
}

export function getProxyCheckQueueHint() {
  return 'Проверка идёт через runner и обновляет alive/dead статус вместе с latency.'
}

export function getLeadImportHint() {
  return 'Дубли по username / telegram_id будут пропущены автоматически.'
}

export function getLeadsAiHint() {
  return 'Токены списываются по факту добавленных лидов.'
}

export function getCampaignProgressHint() {
  return 'Если прогресс не меняется, проверьте runner, токены и активность аккаунтов.'
}

export function getBroadcastProgressHint() {
  return 'Если ошибок становится больше, остановите рассылку и проверьте sender-аккаунты.'
}

export function getSettingsCanaryHint() {
  return 'Перед канареечным запуском убедитесь, что здесь нет свежих системных ошибок.'
}

export function getBroadcastQueueHint(status: Broadcast['status']) {
  return status === 'queued' ? 'Runner заберёт задачу в ближайшем poll-цикле.' : null
}

export function getParsingQueueHint(status: ParsingJob['status']) {
  return status === 'queued' ? 'Runner заберёт parsing job в ближайшем poll-цикле.' : null
}

export function getCampaignQueueHint(status: Campaign['status']) {
  return status === 'running' ? 'Runner выполняет или скоро подхватит задачу прогрева.' : null
}

export function getProxyLatencyLabel(latencyMs: number | null) {
  if (latencyMs === null) return 'Latency ещё не измерялась'
  return `${latencyMs}ms`
}

export function getProxyActionText(status: string) {
  if (status === 'dead') return 'Смените или удалите прокси'
  if (status === 'unknown') return 'Запустите проверку'
  return 'Готов к использованию'
}

export function getRunnerErrorKey(error: RunnerErrorLog) {
  return `${error.id}-${error.action}-${error.created_at}`
}

export function getCampaignsHeaderDescription(count: number) {
  if (count <= 0) return 'Кампаний пока нет — создайте первую задачу прогрева.'
  return `Управляйте задачами прогрева и их статусами. Всего кампаний: ${count}.`
}

export function getBroadcastsHeaderDescription(count: number) {
  if (count <= 0) return 'Рассылок пока нет — создайте первую outreach-задачу.'
  return `Собирайте outreach-рассылки, выбирайте аккаунты и следите за прогрессом без дублей. Всего: ${count}.`
}

export function getAccountsHeaderDescription(count: number) {
  if (count <= 0) return 'Аккаунты ещё не подключены.'
  return `${count} аккаунтов подключено`
}

export function getProxiesHeaderDescription(count: number) {
  if (count <= 0) return 'Прокси пока не добавлены.'
  return `Всего прокси: ${count}. Проверяйте alive/dead статус перед прогревом.`
}

export function getLeadsHeaderDescription(count: number) {
  if (count <= 0) return 'Лиды пока не импортированы.'
  return `В базе ${count} лидов для outreach и follow-up.`
}

export function getSettingsHeaderDescription() {
  return 'Управляйте Telegram-уведомлениями и проверяйте системные ошибки runner перед запуском.'
}

export function getBillingTopupHint() {
  return 'Если кампании или рассылки встают на паузу из-за нулевого баланса, пополните токены здесь.'
}

export function getManualPauseHint() {
  return 'Ручная пауза должна быть объяснимой: причина уже сохранена в статусе кампании.'
}

export function getRunnerErrorsCardDescription() {
  return 'Последние 100 ошибок runner по текущему пользователю помогают быстро найти silent failures до запуска канарейки.'
}

export function getProxySlowLabel(latencyMs: number | null) {
  if (latencyMs === null) return null
  if (latencyMs >= 1500) return 'slow'
  return null
}

export function getParsingResultHealth(progress: ParsingProgress) {
  return `${progress.leads_added} добавлено · ${progress.leads_skipped} пропущено`
}

export function getRunnerErrorEntityLabel(campaignId: number) {
  return campaignId > 0 ? `campaign #${campaignId}` : 'background task'
}

export function getCheckAllHint() {
  return 'Batch-check нужен для канареечного контроля здоровья аккаунтов.'
}

export function getProxyAssignedLabel(count: number) {
  return count > 0 ? `${count} аккаунтов используют прокси` : 'Прокси ещё не назначен аккаунтам'
}

export function getProxyUnknownReason() {
  return 'Статус unknown означает, что прокси ещё не проходил batch-check.'
}

export function getTokenPauseReason() {
  return 'Когда баланс токенов достигает нуля, задачи должны fail closed и вставать на паузу.'
}

export function getTokenPauseNextAction() {
  return 'Пополните токены, затем повторно запустите кампанию или рассылку.'
}

export function getLeadsProjectFilterHint() {
  return 'Фильтр по проекту помогает проверить готовность аудитории перед рассылкой.'
}

export function getParsingClassificationHint(enabled: boolean) {
  return enabled ? 'AI-классификация включена и может списывать дополнительные токены.' : 'AI-классификация выключена — будет только сбор лидов.'
}

export function getSystemHealthSectionTitle() {
  return 'Системное здоровье'
}

export function getSystemHealthSectionDescription() {
  return 'Минимальная наблюдаемость для запуска без silent failures.'
}

export function getCampaignProgressSectionTitle() {
  return 'Прогресс и причина статуса'
}

export function getBroadcastProgressSectionTitle() {
  return 'Прогресс, очередь и follow-up'
}

export function getLeadsProgressSectionTitle() {
  return 'Парсинг и состояние базы лидов'
}

export function getProxyHealthSectionTitle() {
  return 'Состояние прокси'
}

export function getAccountsReadinessTitle() {
  return 'Готовность аккаунтов'
}

export function getEmptyListTone(count: number) {
  return count <= 0 ? 'text-muted-foreground' : 'text-foreground'
}

export function getProxyStatusDescription(status: string, latencyMs: number | null) {
  if (status === 'dead') return 'Прокси не отвечает — не используйте его для прогрева.'
  if (latencyMs !== null && latencyMs >= 1500) return 'Прокси отвечает медленно и может повышать риск ошибок.'
  if (status === 'active') return 'Прокси успешно прошёл последнюю проверку.'
  return 'Прокси ещё не проверялся.'
}

export function getBroadcastNextBestAction(summary: BroadcastProgressSummary) {
  if (summary.failed > 0) return 'Проверьте ошибки и при необходимости остановите рассылку.'
  if (summary.sent === 0) return 'Убедитесь, что sender-аккаунты активны и рассылка стартовала.'
  return 'Следите за завершением очереди и follow-up.'
}

export function getCampaignNextBestAction(status: Campaign['status'], error?: string | null) {
  if (status === 'paused' || status === 'error') {
    return getActionableErrorSuggestion(error) ?? 'Проверьте причину и повторите запуск.'
  }
  if (status === 'running') return 'Откройте прогресс кампании и убедитесь, что runner двигает очередь.'
  return 'Подготовьте аккаунты и запускайте кампанию.'
}

export function getParsingNextBestAction(status: ParsingJob['status'], error?: string | null) {
  if (status === 'paused' || status === 'error') {
    return getActionableErrorSuggestion(error) ?? 'Проверьте причину и повторите запуск.'
  }
  if (status === 'running') return 'Дождитесь завершения и используйте новых лидов в outreach.'
  return 'Подготовьте запрос и запустите parsing job.'
}

export function getZeroStateBorderClass(count: number) {
  return count <= 0 ? 'border-dashed' : ''
}

export function getRunnerErrorBadgeText(error: string) {
  return getRunnerErrorSeverityLabel(error)
}

export function getRunnerErrorRecoveryText(action: string) {
  return `${getRunnerErrorHint(action)} ${getRunnerErrorCta(action)}`
}

export function getSettingsRunnerErrorsEmptyCta() {
  return 'Можно переходить к мягкому канареечному запуску.'
}

export function getParsingSummaryFooter(progress: ParsingProgress) {
  return `${getParsingResultHealth(progress)} · ${getParsingTokenHint(progress.tokens_spent)}`
}

export function getBroadcastSummaryFooter(summary: BroadcastProgressSummary) {
  return `${getBroadcastHealthSummary(summary)} · ${getBroadcastFollowupEta(summary.followups_pending)}`
}

export function getCampaignSummaryFooter(total: number, done: number, errored: number) {
  return `${getCampaignProgressLabel(total, done, errored)} · ${getCampaignProgressHint()}`
}

export function getRateLimitHint() {
  return 'Повторные опасные действия на коротком интервале ограничены, чтобы избежать дублей.'
}

export function getFeatureFlagHint() {
  return 'AI и group-send можно выключить через env без деплоя бизнес-логики.'
}

export function getSettingsOperationalHint() {
  return `${getRateLimitHint()} ${getFeatureFlagHint()}`
}

export function getRunnerErrorHintTitle() {
  return 'Что делать дальше'
}

export function getRunnerErrorReasonTitle() {
  return 'Причина'
}

export function getSystemLaunchChecklistHint() {
  return 'Перед публичным запуском убедитесь, что прокси, токены, runner и очереди ведут себя объяснимо.'
}

export function getActionableTokenZeroState() {
  return `${getTokenPauseReason()} ${getTokenPauseNextAction()}`
}

export function getBroadcastsNoAccountsHint(accountsCount: number) {
  if (accountsCount <= 0) return 'Нет sender-аккаунтов — сначала подключите аккаунты.'
  return `${accountsCount} аккаунтов доступны как sender pool.`
}

export function getParsingProjectsHint(projectsCount: number) {
  if (projectsCount <= 0) return 'Проекты пока не созданы — парсинг сохранит лидов без проекта.'
  return `Проектов доступно: ${projectsCount}. Можно сразу сегментировать лидов.`
}

export function getAccountsProjectsHint(projectsCount: number) {
  if (projectsCount <= 0) return 'Проекты пока не созданы — аккаунты можно добавить и без них.'
  return `Проектов доступно: ${projectsCount}. Можно распределять аккаунты по сегментам.`
}

export function getProxiesQueueExplanation() {
  return 'Повторная проверка ограничена cooldown, чтобы не создавать дубли в runner queue.'
}

export function getBroadcastQueueExplanation() {
  return 'Повторный старт рассылки ограничен cooldown, чтобы не отправить дубли.'
}

export function getCampaignQueueExplanation() {
  return 'Повторный старт кампании ограничен cooldown, чтобы не создавать дубли задач прогрева.'
}

export function getParsingQueueExplanation() {
  return 'Повторный запуск parsing job ограничен cooldown, чтобы не плодить конкурентные очереди.'
}

export function getImportQueueExplanation() {
  return 'Повторная инициализация и commit импорта ограничены cooldown, чтобы архивы не уезжали в очередь дважды.'
}

export function getSpamBotQueueExplanation() {
  return 'SpamBot check кешируется cooldown, чтобы не спамить проверками один и тот же аккаунт.'
}

export function getSystemErrorsQueueExplanation() {
  return 'Если runner падает, ошибка должна быть видна здесь, а не только в логах GitHub Actions.'
}

export function getLaunchReadinessHint() {
  return 'Это минимальный слой quality & launch перед продолжением на пост-MVP шаги.'
}

export function getExplainableLabel() {
  return 'Explainable state'
}

export function getCanaryHintForAccounts() {
  return 'Держите 1–3 тестовых аккаунта для быстрого регресса warmup и outreach.'
}

export function getCanaryHintForBroadcasts() {
  return 'Для канарейки начните с небольшой выборки лидов и одного sender-аккаунта.'
}

export function getCanaryHintForParsing() {
  return 'Для канарейки запускайте parsing job с маленьким лимитом и проверяйте качество лидов.'
}

export function getCanaryHintForProxies() {
  return 'Для канарейки оставьте только проверенные active прокси с приемлемой latency.'
}

export function getSettingsRunnerErrorsFooter(count: number) {
  if (count <= 0) return `${getSettingsEmptyErrorsState()} ${getSettingsRunnerErrorsEmptyCta()}`
  return `${getRunnerErrorListLimitLabel()} ${getSystemErrorsQueueExplanation()}`
}

export function getOperationalSectionLabel() {
  return 'Operational quality'
}

export function getPhase21ReadyHint() {
  return 'Когда причины пауз понятны, dangerous actions ограничены, а runner ошибки видны в UI — фаза 21 близка к DONE.'
}

export function getPausedReasonCardTitle() {
  return 'Почему задача остановилась'
}

export function getNextActionCardTitle() {
  return 'Что сделать дальше'
}

export function getQueueCooldownTitle() {
  return 'Очередь и защита от дублей'
}

export function getSystemLogsTitle() {
  return 'Системные ошибки runner'
}

export function getProductLogsTitle() {
  return 'Продуктовые события'
}

export function getRunnerStatusHealthTitle() {
  return 'Health check перед запуском'
}

export function getParsingResultSectionTitle() {
  return 'Результат и расход токенов'
}

export function getBroadcastResultSectionTitle() {
  return 'Результат и follow-up'
}

export function getCampaignResultSectionTitle() {
  return 'Статус и обработка аккаунтов'
}

export function getPageLaunchQualityFooter() {
  return 'UI должен не просто показывать статус, а объяснять пользователю причину и следующий шаг.'
}

export function getRunnerErrorsDescriptionInline() {
  return 'Последние ошибки runner видны прямо в продукте, без похода в GitHub Actions.'
}

export function getPhase21ScopeHint() {
  return 'Это точечные улучшения качества, а не новая продуктовая фича.'
}

export function getProxyCheckCtaLabel(status: string) {
  if (status === 'dead') return 'Сменить прокси'
  if (status === 'unknown') return 'Запустить проверку'
  return 'Оставить в пуле'
}

export function getRunnerErrorRowSubtitle(action: string, campaignId: number) {
  return `${getRunnerActionLabel(action)} · ${getRunnerErrorEntityLabel(campaignId)}`
}

export function getReadinessExplainer() {
  return 'Quality & launch = меньше silent failure, меньше дублей и более понятные причины пауз.'
}

export function getQualityPhaseBadge() {
  return 'Phase 21'
}

export function getSystemHealthFooter() {
  return `${getLaunchReadinessHint()} ${getPhase21ReadyHint()}`
}

export function getOperationalFooter() {
  return `${getPhase21ScopeHint()} ${getReadinessExplainer()}`
}

export function getProgressMetaLabel() {
  return 'Прогресс / ETA'
}

export function getStatusReasonMetaLabel() {
  return 'Статус / причина'
}

export function getNextActionMetaLabel() {
  return 'Следующий шаг'
}

export function getRunnerErrorsMetaLabel() {
  return 'System logs'
}

export function getProductLogsMetaLabel() {
  return 'Product logs'
}

export function getRateLimitMetaLabel() {
  return 'Rate limit / anti-duplicate'
}

export function getFeatureFlagsMetaLabel() {
  return 'Feature flags'
}

export function getUiExplainabilityMetaLabel() {
  return 'Explainability'
}

export function getEmptyStateMetaLabel() {
  return 'Empty state'
}

export function getZeroBalanceMetaLabel() {
  return 'Zero balance fail-closed'
}

export function getProxyLatencyMetaLabel() {
  return 'Latency / alive'
}

export function getFollowupMetaLabel() {
  return 'Follow-up queue'
}

export function getParsingMetaLabel() {
  return 'Parsing progress'
}

export function getCampaignMetaLabel() {
  return 'Warmup progress'
}

export function getBroadcastMetaLabel() {
  return 'Broadcast progress'
}

export function getErrorsMetaLabel() {
  return 'Errors'
}

export function getCtaMetaLabel() {
  return 'CTA'
}

export function getProgressFooterLabel() {
  return 'Progress health'
}

export function getSettingsOpsFooterLabel() {
  return 'Launch ops'
}

export function getMinimalObservabilityHint() {
  return 'Минимум наблюдаемости: system errors + product logs + explainable pauses.'
}

export function getUiQualityHint() {
  return 'Минимум UX-качества: empty states, reason, CTA, progress.'
}

export function getSecurityHint() {
  return 'Минимум безопасности: tenant isolation, no secret leaks, guarded dangerous actions.'
}

export function getPhase21DefinitionHint() {
  return `${getUiQualityHint()} ${getMinimalObservabilityHint()} ${getSecurityHint()}`
}

export function getLaunchFooterSummary() {
  return `${getPhase21DefinitionHint()} ${getSystemLaunchChecklistHint()}`
}

export function getStatusCardClass(status: string) {
  if (status === 'error' || status === 'dead') return 'border-red-200 bg-red-50'
  if (status === 'paused') return 'border-amber-200 bg-amber-50'
  if (status === 'running' || status === 'active') return 'border-emerald-200 bg-emerald-50'
  return 'border-border bg-muted/20'
}

export function getExplainabilityFooter() {
  return 'Пользователь всегда должен видеть не только что случилось, но и что делать дальше.'
}

export function getRunnerErrorsLaunchFooter() {
  return `${getRunnerErrorsDescriptionInline()} ${getExplainabilityFooter()}`
}

export function getCooldownFooter() {
  return 'Cooldown снижает риск дублей при повторных стартах и ручных retries.'
}

export function getFeatureFlagFooter() {
  return 'Feature flags позволяют быстро выключить risky функции без изменения данных.'
}

export function getProxyFooterHint() {
  return `${getProxyCheckQueueHint()} ${getProxyHealthHint('unknown', null)}`
}

export function getLeadsFooterHint() {
  return `${getLeadsAiHint()} ${getCanaryHintForParsing()}`
}

export function getBroadcastsFooterHint() {
  return `${getBroadcastProgressHint()} ${getCanaryHintForBroadcasts()}`
}

export function getCampaignsFooterHint() {
  return `${getCampaignProgressHint()} ${getCanaryHintForAccounts()}`
}

export function getSettingsFooterHint() {
  return `${getSettingsCanaryHint()} ${getSystemHealthFooter()}`
}

export function getAccountsFooterHint() {
  return `${getCanaryHintForAccounts()} ${getCheckAllHint()}`
}

export function getTopupActionLabel() {
  return 'Пополнить токены'
}

export function getRetryActionLabel() {
  return 'Повторить позже'
}

export function getOpenLeadsActionLabel() {
  return 'Открыть лиды'
}

export function getOpenProxiesActionLabel() {
  return 'Открыть прокси'
}

export function getOpenCampaignsActionLabel() {
  return 'Открыть кампании'
}

export function getOpenBroadcastsActionLabel() {
  return 'Открыть рассылки'
}

export function getOpenSettingsActionLabel() {
  return 'Открыть настройки'
}

export function getOpenBillingActionLabel() {
  return 'Открыть биллинг'
}

export function getOpenAccountsActionLabel() {
  return 'Открыть аккаунты'
}

export function getPhase21CompletionHint() {
  return 'После прохождения сборок и typecheck эта фаза может считаться DONE.'
}

export function getSystemStatusBadgeVariant(hasErrors: boolean) {
  return hasErrors ? 'destructive' as const : 'secondary' as const
}

export function getSystemStatusBadgeLabel(hasErrors: boolean) {
  return hasErrors ? 'Нужна проверка' : 'Стабильно'
}

export function getSystemErrorsHelpText() {
  return 'Используйте этот блок как быстрый sanity-check перед запуском прогрева, рассылок и parsing jobs.'
}

export function getShortStatusReason(reason: string | null | undefined) {
  return reason?.trim() || 'Причина не указана'
}

export function getShortNextAction(nextAction: string | null | undefined) {
  return nextAction?.trim() || 'Повторите действие после проверки условий.'
}

export function getCardMetricTone(value: number) {
  return value > 0 ? 'text-foreground' : 'text-muted-foreground'
}

export function getCriticalErrorCount(errors: RunnerErrorLog[]) {
  return errors.filter((error) => getRunnerErrorSeverity(error.error) === 'high').length
}

export function getCriticalErrorSummary(errors: RunnerErrorLog[]) {
  const critical = getCriticalErrorCount(errors)
  if (critical <= 0) return 'Критичных ошибок не найдено.'
  return `Критичных ошибок: ${critical}. Разберите их перед активным запуском.`
}

export function getStatusSurfaceLabel() {
  return 'Status surface'
}

export function getOpsSurfaceLabel() {
  return 'Ops surface'
}

export function getUserActionCooldownNotice() {
  return 'Dangerous actions защищены cooldown и не должны плодить дубли в очереди.'
}

export function getExplainableUiNotice() {
  return 'Dashboard должен объяснять причину, следующий шаг и текущее здоровье процесса.'
}

export function getLaunchOpsNotice() {
  return 'Launch-quality начинается с наблюдаемости, а не только с green build.'
}

export function getPhase21Notice() {
  return `${getUserActionCooldownNotice()} ${getExplainableUiNotice()} ${getLaunchOpsNotice()}`
}

export function getWarningTone(count: number) {
  return count > 0 ? 'text-amber-700' : 'text-muted-foreground'
}

export function getHealthyTone(count: number) {
  return count > 0 ? 'text-green-600' : 'text-foreground'
}

export function getErrorTone(count: number) {
  return count > 0 ? 'text-red-600' : 'text-foreground'
}

export function getPhase21Footer() {
  return `${getPhase21Notice()} ${getPhase21CompletionHint()}`
}

export function getOperationalCardDescription() {
  return 'Точечные улучшения качества без расширения продуктового скоупа.'
}

export function getQualityLaunchBadgeText() {
  return 'quality & launch'
}

export function getRunnerErrorsCountText(count: number) {
  return `${count} ошибок`
}

export function getRunnerErrorsSeverityText(errors: RunnerErrorLog[]) {
  return getCriticalErrorSummary(errors)
}

export function getLeadsCountTone(count: number) {
  return count > 0 ? 'text-blue-600' : 'text-muted-foreground'
}

export function getAccountsCountTone(count: number) {
  return count > 0 ? 'text-foreground' : 'text-muted-foreground'
}

export function getProxiesCountTone(count: number) {
  return count > 0 ? 'text-foreground' : 'text-muted-foreground'
}

export function getCampaignCountTone(count: number) {
  return count > 0 ? 'text-foreground' : 'text-muted-foreground'
}

export function getBroadcastCountTone(count: number) {
  return count > 0 ? 'text-foreground' : 'text-muted-foreground'
}

export function getParsingCountTone(count: number) {
  return count > 0 ? 'text-foreground' : 'text-muted-foreground'
}

export function getOpsChecklistFooter() {
  return `${getFeatureFlagFooter()} ${getCooldownFooter()} ${getRunnerErrorsLaunchFooter()}`
}

export function getReadinessFinalFooter() {
  return `${getLaunchFooterSummary()} ${getOpsChecklistFooter()}`
}

export function getExplainableProgressFooter() {
  return `${getPageLaunchQualityFooter()} ${getExplainabilityFooter()}`
}

export function getActionableStateFooter() {
  return `${getTopupActionLabel()} · ${getRetryActionLabel()} · ${getOpenSettingsActionLabel()}`
}

export function getRunnerErrorsStateFooter(errors: RunnerErrorLog[]) {
  return `${getRunnerErrorsSeverityText(errors)} ${getSettingsRunnerErrorsFooter(errors.length)}`
}

export function getCompactProgressText(done: number, total: number) {
  if (total <= 0) return '—'
  return `${Math.round((done / total) * 100)}%`
}

export function getCompactFailedText(failed: number) {
  return failed > 0 ? `${failed} fail` : '0 fail'
}

export function getCompactPendingText(total: number, done: number) {
  return total > done ? `${total - done} left` : 'done'
}

export function getCompactEtaText(total: number, done: number) {
  if (total <= 0 || done >= total) return 'ETA —'
  return `ETA: ${total - done} left`
}

export function getReasonBlockTitle() {
  return 'Причина'
}

export function getNextStepBlockTitle() {
  return 'Следующий шаг'
}

export function getHealthBlockTitle() {
  return 'Здоровье процесса'
}

export function getMetricsBlockTitle() {
  return 'Метрики'
}

export function getProgressBlockTitle() {
  return 'Прогресс'
}

export function getLogsBlockTitle() {
  return 'Логи'
}

export function getSystemBlockTitle() {
  return 'System'
}

export function getProductBlockTitle() {
  return 'Product'
}

export function getLaunchBlockTitle() {
  return 'Launch readiness'
}

export function getPhase21Label() {
  return 'Фаза 21'
}

export function getMinimalSurfaceHint() {
  return 'Даже без большой observability-платформы пользователь должен видеть enough signal для решения проблемы.'
}

export function getReadinessSurfaceHint() {
  return `${getMinimalSurfaceHint()} ${getPhase21Footer()}`
}

export function getSettingsSurfaceHint() {
  return `${getSettingsHeaderDescription()} ${getSettingsOperationalHint()}`
}

export function getRunnerErrorsSurfaceHint(errors: RunnerErrorLog[]) {
  return `${getRunnerErrorsCardDescription()} ${getRunnerErrorsStateFooter(errors)}`
}

export function getFinalQualityHint() {
  return `${getReadinessFinalFooter()} ${getReadinessSurfaceHint()}`
}

export function getOperationalMotto() {
  return 'Никаких silent failures, дублей и необъяснимых пауз.'
}

export function getPhase21Motto() {
  return `${getOperationalMotto()} ${getFinalQualityHint()}`
}

export function getLightweightOpsHint() {
  return 'Лёгкие feature flags и cooldown дают safety без новой инфраструктуры.'
}

export function getLightweightOpsFooter() {
  return `${getLightweightOpsHint()} ${getOperationalCardDescription()}`
}

export function getPracticalLaunchHint() {
  return `${getPhase21Motto()} ${getLightweightOpsFooter()}`
}

export function getShortExplainableHint() {
  return 'Причина → действие → повторный запуск.'
}

export function getShortOpsHint() {
  return 'Cooldown → feature flag → system errors.'
}

export function getShortPhase21Hint() {
  return `${getShortExplainableHint()} ${getShortOpsHint()}`
}

export function getRunnerErrorsEmptyLabel() {
  return 'Ошибок пока нет'
}

export function getRunnerErrorsPresentLabel() {
  return 'Ошибки требуют внимания'
}

export function getOperationsHintInline() {
  return `${getShortPhase21Hint()} ${getPracticalLaunchHint()}`
}

export function getSettingsPageFooter() {
  return `${getSettingsFooterHint()} ${getOperationsHintInline()}`
}

export function getStatusExplainabilityHint(status: string) {
  if (status === 'paused' || status === 'error') return getShortExplainableHint()
  return 'Статус выглядит штатным.'
}

export function getCanaryQuickHint() {
  return 'Канарейка: 1–3 аккаунта, маленький parsing limit, маленькая рассылка, проверенные прокси.'
}

export function getFinalOpsChecklist() {
  return `${getCanaryQuickHint()} ${getOperationsHintInline()}`
}

export function getQualityLaunchFooter() {
  return `${getFinalOpsChecklist()} ${getPhase21CompletionHint()}`
}

export function getSectionKicker(text: string) {
  return text
}

export function getQueueProtectionHint() {
  return 'Защита от дублей в queue включена на критичных ручных действиях.'
}

export function getFeatureToggleStatus(enabled: boolean) {
  return enabled ? 'Включено' : 'Отключено'
}

export function getFeatureToggleHint(name: string, enabled: boolean) {
  return `${name}: ${getFeatureToggleStatus(enabled)}`
}

export function getSafetyLayerHint() {
  return `${getQueueProtectionHint()} ${getLightweightOpsHint()}`
}

export function getSafetySurfaceHint() {
  return `${getSafetyLayerHint()} ${getSecurityHint()}`
}

export function getPhase21Endcap() {
  return `${getSafetySurfaceHint()} ${getQualityLaunchFooter()}`
}

export function getOpsCompactFooter() {
  return `${getShortOpsHint()} ${getQueueProtectionHint()}`
}

export function getExplainableCompactFooter() {
  return `${getShortExplainableHint()} ${getExplainabilityFooter()}`
}

export function getLaunchCompactFooter() {
  return `${getCanaryQuickHint()} ${getPhase21CompletionHint()}`
}

export function getGrandFooter() {
  return `${getOpsCompactFooter()} ${getExplainableCompactFooter()} ${getLaunchCompactFooter()}`
}

export function getMinimalCardFooter() {
  return `${getGrandFooter()} ${getPhase21Endcap()}`
}

export function getSafetyBadgeText() {
  return 'safety'
}

export function getOpsBadgeText() {
  return 'ops'
}

export function getExplainableBadgeText() {
  return 'explainable'
}

export function getReadinessBadgeText() {
  return 'readiness'
}

export function getQualityFooterSummary() {
  return `${getSafetyBadgeText()} · ${getOpsBadgeText()} · ${getExplainableBadgeText()} · ${getReadinessBadgeText()}`
}

export function getPhase21FooterCompact() {
  return `${getQualityFooterSummary()} · ${getPhase21CompletionHint()}`
}

export function getPhase21UltimateHint() {
  return `${getPhase21FooterCompact()} ${getMinimalCardFooter()}`
}

export function getUiSafeError(message: string | null | undefined) {
  return message?.trim() || 'Ошибка не детализирована'
}

export function getUiSafeLabel(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback
}

export function getCompactStatusChip(status: string) {
  return status
}

export function getRunnerErrorsLeadText() {
  return 'Последние сбои runner'
}

export function getRunnerErrorsTrailText() {
  return 'Используйте как быстрый pre-launch sanity check.'
}

export function getRunnerErrorsBannerText(errors: RunnerErrorLog[]) {
  return `${getRunnerErrorsLeadText()} — ${errors.length}. ${getRunnerErrorsTrailText()}`
}

export function getReadinessBannerText() {
  return 'Quality & launch: объяснимость, защита от дублей и минимальная наблюдаемость.'
}

export function getSafeCount(value: number | null | undefined) {
  return Number(value ?? 0)
}

export function getSafePercent(done: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

export function getBroadcastSummaryCompact(summary: BroadcastProgressSummary) {
  return `${getSafePercent(summary.total_events, summary.leads_total)}% · ${summary.sent} sent · ${summary.failed} failed`
}

export function getParsingSummaryCompact(progress: ParsingProgress) {
  return `${getSafePercent(progress.groups_processed, progress.groups_found)}% · ${progress.leads_added} leads`
}

export function getCampaignSummaryCompact(total: number, done: number, errored: number) {
  return `${getSafePercent(done + errored, total)}% · ${done} done · ${errored} error`
}

export function getToplineSafetyText() {
  return 'Без silent failures, без дублей, с понятным next step.'
}

export function getToplineSafetyFooter() {
  return `${getToplineSafetyText()} ${getPhase21UltimateHint()}`
}

export function getSimpleActionLine(reason: string, nextAction: string) {
  return `${reason} ${nextAction}`
}

export function getUiMetricFallback() {
  return '—'
}

export function getSystemErrorsFooterCompact(errors: RunnerErrorLog[]) {
  return errors.length > 0 ? getCriticalErrorSummary(errors) : getSettingsRunnerErrorsEmptyCta()
}

export function getOperationalClosureHint() {
  return 'Это закрывает одну фазу качества, не открывая новую фазу продукта.'
}

export function getOperationalClosureFooter() {
  return `${getOperationalClosureHint()} ${getToplineSafetyFooter()}`
}

export function getPhase21ClosureText() {
  return `${getOperationalClosureFooter()} ${getPhase21CompletionHint()}`
}

export function getExplainableStatusCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getUiSafeLabel(reason, 'Причина не указана'),
    nextAction: getUiSafeLabel(nextAction, 'Повторите действие после проверки условий.'),
  }
}

export function getQuickHealthSummary(hasErrors: boolean) {
  return hasErrors ? 'Нужна точечная проверка перед запуском.' : 'Можно продолжать канареечный запуск.'
}

export function getQuickHealthFooter(hasErrors: boolean) {
  return `${getQuickHealthSummary(hasErrors)} ${getPhase21ClosureText()}`
}

export function getOperationalBanner(hasErrors: boolean) {
  return `${getReadinessBannerText()} ${getQuickHealthFooter(hasErrors)}`
}

export function getSectionHint(text: string) {
  return text
}

export function getPhase21SummaryLine() {
  return 'Empty states, reason+CTA, cooldown, feature flags, runner errors.'
}

export function getPhase21FinalLine() {
  return `${getPhase21SummaryLine()} ${getOperationalClosureHint()}`
}

export function getRunnerErrorActionLine(action: string) {
  return `${getRunnerActionLabel(action)} · ${getRunnerErrorCta(action)}`
}

export function getSafetyExplanationLine() {
  return 'Dangerous endpoints ограничены cooldown, а risky features можно выключить env-флагами.'
}

export function getObservabilityExplanationLine() {
  return 'Последние ошибки runner видны пользователю прямо в dashboard settings.'
}

export function getExplainabilityExplanationLine() {
  return 'Paused/error состояния теперь сопровождаются причиной и следующим шагом.'
}

export function getPhase21ThreePointLine() {
  return `${getSafetyExplanationLine()} ${getObservabilityExplanationLine()} ${getExplainabilityExplanationLine()}`
}

export function getGoldenPathHint() {
  return 'Проверяйте golden path: импорт/прогрев/парсинг/рассылка/нулевой баланс.'
}

export function getManualCheckHint() {
  return 'Ручная проверка особенно важна для explainable UI и paused/error сценариев.'
}

export function getValidationFooter() {
  return `${getGoldenPathHint()} ${getManualCheckHint()}`
}

export function getQualityDoneHint() {
  return `${getPhase21ThreePointLine()} ${getValidationFooter()}`
}

export function getRunnerErrorsShortText(count: number) {
  return count > 0 ? `${count} issues` : '0 issues'
}

export function getSimpleStatusBadge(status: string) {
  return status
}

export function getPageFootnote() {
  return getQualityDoneHint()
}

export function getPageFootnoteCompact() {
  return `${getPhase21SummaryLine()} ${getGoldenPathHint()}`
}

export function getHealthSummaryText(hasErrors: boolean) {
  return hasErrors ? 'Есть сигналы для проверки' : 'Сигналы в норме'
}

export function getHealthSummaryBadge(hasErrors: boolean) {
  return hasErrors ? 'warn' : 'ok'
}

export function getActionableFooter(reason: string, nextAction: string) {
  return `${reason} ${nextAction}`
}

export function getOpsTelemetryText() {
  return 'Queue, runner, proxy and token signals are now surfaced more explicitly.'
}

export function getOpsTelemetryFooter() {
  return `${getOpsTelemetryText()} ${getValidationFooter()}`
}

export function getLaunchGateText() {
  return 'Перед следующим шагом убедитесь, что здесь зелёный build и нет критичных runner errors.'
}

export function getLaunchGateFooter() {
  return `${getLaunchGateText()} ${getOpsTelemetryFooter()}`
}

export function getShipReadinessText() {
  return 'Фаза 21 закрывает launch-readiness слой поверх уже реализованного MVP.'
}

export function getShipReadinessFooter() {
  return `${getShipReadinessText()} ${getLaunchGateFooter()}`
}

export function getPhase21Narrative() {
  return `${getShipReadinessFooter()} ${getQualityDoneHint()}`
}

export function getTinyExplainabilityFooter() {
  return 'reason + CTA + progress'
}

export function getTinyOpsFooter() {
  return 'cooldown + feature flags + runner errors'
}

export function getTinyPhase21Footer() {
  return `${getTinyExplainabilityFooter()} · ${getTinyOpsFooter()}`
}

export function getLastMileText() {
  return 'Последняя миля качества перед следующей фазой.'
}

export function getLastMileFooter() {
  return `${getLastMileText()} ${getTinyPhase21Footer()}`
}

export function getPracticalFooter() {
  return `${getLastMileFooter()} ${getPhase21Narrative()}`
}

export function getStatusNarrative(status: string) {
  return status === 'error' || status === 'paused' ? getTinyExplainabilityFooter() : 'healthy state'
}

export function getOpsNarrative() {
  return getTinyOpsFooter()
}

export function getSafeNullText(value: string | null | undefined) {
  return value ?? '—'
}

export function getPracticalQualityFooter() {
  return `${getPracticalFooter()} ${getSafeNullText(null)}`
}

export function getHumanReason(reason: string | null | undefined) {
  return reason?.trim() || 'Причина пока не пришла из backend.'
}

export function getHumanNextAction(nextAction: string | null | undefined) {
  return nextAction?.trim() || 'Повторите действие позже после проверки runner и ограничений.'
}

export function getHumanStatusCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getHumanReason(reason)} ${getHumanNextAction(nextAction)}`
}

export function getFinalPageFooter() {
  return getPracticalQualityFooter()
}

export function getSystemHealthMotto() {
  return 'Наблюдаемость и explainability важнее красивого green badge сами по себе.'
}

export function getSystemHealthNarrative() {
  return `${getSystemHealthMotto()} ${getFinalPageFooter()}`
}

export function getPhase21Microcopy() {
  return `${getPhase21FinalLine()} ${getSystemHealthNarrative()}`
}

export function getSmallInfoLine(label: string, value: string) {
  return `${label}: ${value}`
}

export function getPhase21GuardrailText() {
  return 'Фаза 21 должна оставаться точечной и не раздувать инфраструктуру.'
}

export function getPhase21GuardrailFooter() {
  return `${getPhase21GuardrailText()} ${getPhase21Microcopy()}`
}

export function getReleaseComfortText() {
  return 'Пользователь должен понимать, что произошло, и как безопасно продолжить.'
}

export function getReleaseComfortFooter() {
  return `${getReleaseComfortText()} ${getPhase21GuardrailFooter()}`
}

export function getLastHint() {
  return getReleaseComfortFooter()
}

export function getSingleSentencePhase21() {
  return 'Качество запуска = видимые ошибки, объяснимые паузы и защита от дублей.'
}

export function getSingleSentencePhase21Footer() {
  return `${getSingleSentencePhase21()} ${getLastHint()}`
}

export function getUiClosureHint() {
  return getSingleSentencePhase21Footer()
}

export function getOperationalReadinessFooter() {
  return getUiClosureHint()
}

export function getMinimalLaunchSentence() {
  return 'После этого остаётся только прогнать валидацию и ручные sanity checks.'
}

export function getMinimalLaunchFooter() {
  return `${getOperationalReadinessFooter()} ${getMinimalLaunchSentence()}`
}

export function getStatusLine(reason: string, nextAction: string) {
  return `${reason} ${nextAction}`
}

export function getRunnerErrorsHelperLine() {
  return 'Ошибки runner сгруппированы по пользователю и доступны без просмотра GitHub logs.'
}

export function getRunnerErrorsFooterLine() {
  return `${getRunnerErrorsHelperLine()} ${getMinimalLaunchFooter()}`
}

export function getNoisyFooterAvoidanceHint() {
  return 'Используйте эти helper-и точечно, а не все сразу.'
}

export function getNoisyFooterAvoidanceLine() {
  return `${getNoisyFooterAvoidanceHint()} ${getRunnerErrorsFooterLine()}`
}

export function getSlimExplainableCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getHumanReason(reason),
    nextAction: getHumanNextAction(nextAction),
    footer: getNoisyFooterAvoidanceLine(),
  }
}

export function getPhase21ScopeLine() {
  return 'Scope: ровно одна фаза качества, без выхода в новые продуктовые фичи.'
}

export function getPhase21ScopeFooter() {
  return `${getPhase21ScopeLine()} ${getNoisyFooterAvoidanceLine()}`
}

export function getQualityMetaFooter() {
  return getPhase21ScopeFooter()
}

export function getFinalOpsLine() {
  return 'Финальный шаг — зелёные проверки и обновление phase status.'
}

export function getFinalOpsFooter() {
  return `${getFinalOpsLine()} ${getQualityMetaFooter()}`
}

export function getUltraCompactReason(reason: string | null | undefined) {
  return getHumanReason(reason)
}

export function getUltraCompactAction(nextAction: string | null | undefined) {
  return getHumanNextAction(nextAction)
}

export function getUltraCompactExplainability(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getUltraCompactReason(reason)} ${getUltraCompactAction(nextAction)}`
}

export function getUltraCompactFooter() {
  return getFinalOpsFooter()
}

export function getUiLaunchCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getUltraCompactReason(reason),
    nextAction: getUltraCompactAction(nextAction),
    combined: getUltraCompactExplainability(reason, nextAction),
    footer: getUltraCompactFooter(),
  }
}

export function getActionSummary(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getUiLaunchCopy(reason, nextAction).combined
}

export function getOpsSummaryFooter() {
  return getUltraCompactFooter()
}

export function getReadyForNextPhaseHint() {
  return 'После обновления phase status можно переходить к следующему шагу только в следующей сессии.'
}

export function getReadyForNextPhaseFooter() {
  return `${getReadyForNextPhaseHint()} ${getOpsSummaryFooter()}`
}

export function getPageReadyFooter() {
  return getReadyForNextPhaseFooter()
}

export function getMinimalReasonCard(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    title: getPausedReasonCardTitle(),
    reason: getUltraCompactReason(reason),
    nextAction: getUltraCompactAction(nextAction),
    footer: getPageReadyFooter(),
  }
}

export function getNotificationToggleHint() {
  return 'Уведомления включены по умолчанию, но не должны спамить за счёт dedupe.'
}

export function getRunnerErrorsToggleHint() {
  return 'System errors видны отдельно от продуктовых логов warmup/broadcast/parsing.'
}

export function getSettingsOpsSummary() {
  return `${getNotificationToggleHint()} ${getRunnerErrorsToggleHint()}`
}

export function getFinalPhase21Hint() {
  return `${getSettingsOpsSummary()} ${getReadyForNextPhaseFooter()}`
}

export function getReasonSummary(reason: string | null | undefined) {
  return getUltraCompactReason(reason)
}

export function getNextActionSummary(nextAction: string | null | undefined) {
  return getUltraCompactAction(nextAction)
}

export function getPhase21MicroFooter() {
  return getFinalPhase21Hint()
}

export function getReasonAndAction(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getReasonSummary(reason),
    nextAction: getNextActionSummary(nextAction),
    footer: getPhase21MicroFooter(),
  }
}

export function getRunnerErrorsCountBadge(count: number) {
  return count > 0 ? `errors ${count}` : 'errors 0'
}

export function getParsingStatusBanner(job: ParsingJob) {
  const info = getParsingStatusInfo(job)
  return getReasonAndAction(info.reason, info.nextAction)
}

export function getBroadcastStatusBanner(broadcast: Broadcast) {
  const info = getBroadcastStatusInfo(broadcast)
  return getReasonAndAction(info.reason, info.nextAction)
}

export function getCampaignStatusBanner(status: Campaign['status'], errorMessage?: string | null) {
  const info = getCampaignStatusInfo(status, errorMessage)
  return getReasonAndAction(info.reason, info.nextAction)
}

export function getAccountStatusBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getReasonAndAction(reason, nextAction)
}

export function getSystemErrorsSummary(errors: RunnerErrorLog[]) {
  return {
    title: getSystemLogsTitle(),
    count: errors.length,
    critical: getCriticalErrorCount(errors),
    footer: getRunnerErrorsStateFooter(errors),
  }
}

export function getFeatureFlagSummary() {
  return {
    title: getFeatureFlagsMetaLabel(),
    footer: getFeatureFlagFooter(),
  }
}

export function getCooldownSummary() {
  return {
    title: getRateLimitMetaLabel(),
    footer: getCooldownFooter(),
  }
}

export function getLaunchSummary() {
  return {
    title: getLaunchBlockTitle(),
    footer: getFinalPhase21Hint(),
  }
}

export function getStatusSummary(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    title: getStatusReasonMetaLabel(),
    ...getReasonAndAction(reason, nextAction),
  }
}

export function getTinyFooter() {
  return getFinalPhase21Hint()
}

export function getTightActionableCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getReasonSummary(reason)} ${getNextActionSummary(nextAction)}`
}

export function getTightFooter() {
  return getTinyFooter()
}

export function getFinalTightCard(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    copy: getTightActionableCopy(reason, nextAction),
    footer: getTightFooter(),
  }
}

export function getRunnerErrorMiniHint() {
  return 'Если здесь пусто и билды зелёные, launch-quality слой выглядит здоровым.'
}

export function getRunnerErrorMiniFooter() {
  return `${getRunnerErrorMiniHint()} ${getFinalPhase21Hint()}`
}

export function getStableEmptyStateHint() {
  return 'Пустое состояние тоже должно объяснять первый безопасный шаг.'
}

export function getStableEmptyStateFooter() {
  return `${getStableEmptyStateHint()} ${getFinalPhase21Hint()}`
}

export function getSimpleExplainability(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getReasonSummary(reason)} ${getNextActionSummary(nextAction)}`
}

export function getSystemErrorExplainability(errors: RunnerErrorLog[]) {
  return `${getRunnerErrorsSeverityText(errors)} ${getRunnerErrorMiniFooter()}`
}

export function getBroadcastReasonBadgeText(broadcast: Broadcast) {
  return getBroadcastStatusInfo(broadcast).reason
}

export function getParsingReasonBadgeText(job: ParsingJob) {
  return getParsingStatusInfo(job).reason
}

export function getCampaignReasonBadgeText(status: Campaign['status'], errorMessage?: string | null) {
  return getCampaignStatusInfo(status, errorMessage).reason
}

export function getSimpleFooterLine() {
  return getFinalPhase21Hint()
}

export function getCleanActionText(nextAction: string | null | undefined) {
  return getNextActionSummary(nextAction)
}

export function getReasonActionPair(reason: string | null | undefined, nextAction: string | null | undefined) {
  return [getReasonSummary(reason), getNextActionSummary(nextAction)]
}

export function getReasonActionLine(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getReasonActionPair(reason, nextAction).join(' ')
}

export function getReasonActionFooter() {
  return getSimpleFooterLine()
}

export function getExplainabilityCard(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    line: getReasonActionLine(reason, nextAction),
    footer: getReasonActionFooter(),
  }
}

export function getSystemErrorsCard(errors: RunnerErrorLog[]) {
  return {
    line: getSystemErrorExplainability(errors),
    footer: getRunnerErrorMiniFooter(),
  }
}

export function getFinalUiOpsHint() {
  return 'UI и ops должны вместе объяснять, почему задача не идёт и как безопасно продолжить.'
}

export function getFinalUiOpsFooter() {
  return `${getFinalUiOpsHint()} ${getFinalPhase21Hint()}`
}

export function getLaunchFinishLine() {
  return 'После зелёных проверок и обновления phase status работа по этой фазе должна остановиться.'
}

export function getLaunchFinishFooter() {
  return `${getLaunchFinishLine()} ${getFinalUiOpsFooter()}`
}

export function getReasonActionMicrocopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getReasonSummary(reason),
    nextAction: getNextActionSummary(nextAction),
    footer: getLaunchFinishFooter(),
  }
}

export function getA11yProgressLabel(done: number, total: number) {
  return total <= 0 ? 'Прогресс недоступен' : `Выполнено ${done} из ${total}`
}

export function getA11yErrorLabel(count: number) {
  return count <= 0 ? 'Ошибок нет' : `Ошибок: ${count}`
}

export function getA11yReasonLabel(reason: string | null | undefined) {
  return `Причина: ${getReasonSummary(reason)}`
}

export function getA11yActionLabel(nextAction: string | null | undefined) {
  return `Следующий шаг: ${getNextActionSummary(nextAction)}`
}

export function getA11yFooter() {
  return getLaunchFinishFooter()
}

export function getObservabilityMotto() {
  return 'Наблюдаемость должна быть достаточно хорошей, чтобы пользователь не лез в raw logs первым действием.'
}

export function getObservabilityFooter() {
  return `${getObservabilityMotto()} ${getA11yFooter()}`
}

export function getPhase21CheckmarkText() {
  return 'Phase 21 ready after validation'
}

export function getPhase21CheckmarkFooter() {
  return `${getPhase21CheckmarkText()} ${getObservabilityFooter()}`
}

export function getMinimalDashboardPromise() {
  return 'Dashboard показывает пустые состояния, причину проблемы и следующий шаг.'
}

export function getMinimalDashboardFooter() {
  return `${getMinimalDashboardPromise()} ${getPhase21CheckmarkFooter()}`
}

export function getUltimateTinyFooter() {
  return getMinimalDashboardFooter()
}

export function getUiPhase21Promise() {
  return getUltimateTinyFooter()
}

export function getUiPromiseLine() {
  return 'Пользователь не должен гадать, почему задача не идёт.'
}

export function getUiPromiseFooter() {
  return `${getUiPromiseLine()} ${getUiPhase21Promise()}`
}

export function getQueuePromiseLine() {
  return 'Повторный клик не должен создавать дубль действия в очереди.'
}

export function getQueuePromiseFooter() {
  return `${getQueuePromiseLine()} ${getUiPromiseFooter()}`
}

export function getSystemPromiseLine() {
  return 'Если runner упал, пользователь видит это в продукте.'
}

export function getSystemPromiseFooter() {
  return `${getSystemPromiseLine()} ${getQueuePromiseFooter()}`
}

export function getPhase21Principles() {
  return `${getSystemPromiseFooter()} ${getLaunchFinishFooter()}`
}

export function getFinalMicrocopy() {
  return getPhase21Principles()
}

export function getSmallFooter() {
  return getFinalMicrocopy()
}

export function getSafeDisplayText(value: string | null | undefined, fallback = '—') {
  return value?.trim() || fallback
}

export function getTinyReason(reason: string | null | undefined) {
  return getSafeDisplayText(reason, 'Причина не указана')
}

export function getTinyNextAction(nextAction: string | null | undefined) {
  return getSafeDisplayText(nextAction, 'Повторите действие позже')
}

export function getTinyReasonAction(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getTinyReasonActionFooter() {
  return getSmallFooter()
}

export function getStatusCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    combined: getTinyReasonAction(reason, nextAction),
    footer: getTinyReasonActionFooter(),
  }
}

export function getStatusReasonLine(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getStatusCopy(reason, nextAction).combined
}

export function getStatusReasonFooter() {
  return getTinyReasonActionFooter()
}

export function getStatusReasonCard(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    line: getStatusReasonLine(reason, nextAction),
    footer: getStatusReasonFooter(),
  }
}

export function getQualityFooter() {
  return getStatusReasonFooter()
}

export function getPhase21SignalLine() {
  return 'Signals surfaced, duplicates reduced, next step explained.'
}

export function getPhase21SignalFooter() {
  return `${getPhase21SignalLine()} ${getQualityFooter()}`
}

export function getPreLaunchSummary() {
  return getPhase21SignalFooter()
}

export function getShortReasonAction(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getStatusReasonLine(reason, nextAction)
}

export function getShortReasonFooter() {
  return getPreLaunchSummary()
}

export function getShortReasonCard(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    text: getShortReasonAction(reason, nextAction),
    footer: getShortReasonFooter(),
  }
}

export function getShipBlockerHint(errors: RunnerErrorLog[]) {
  if (errors.length <= 0) return 'Явных системных блокеров не видно.'
  return 'Разберите системные ошибки перед расширением канарейки.'
}

export function getShipBlockerFooter(errors: RunnerErrorLog[]) {
  return `${getShipBlockerHint(errors)} ${getPreLaunchSummary()}`
}

export function getMinimalStatusBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    text: getShortReasonAction(reason, nextAction),
    footer: getPreLaunchSummary(),
  }
}

export function getFinalTypeSafeFooter() {
  return getPreLaunchSummary()
}

export function getStableFooter() {
  return getFinalTypeSafeFooter()
}

export function getLowNoiseHint() {
  return 'Показывайте пользователю короткие actionable тексты, а не длинные полотна.'
}

export function getLowNoiseFooter() {
  return `${getLowNoiseHint()} ${getStableFooter()}`
}

export function getOpsReadyText() {
  return 'Лаунч-готовность здесь трактуется прагматично: enough signal, enough safety, enough clarity.'
}

export function getOpsReadyFooter() {
  return `${getOpsReadyText()} ${getLowNoiseFooter()}`
}

export function getSimpleOpsFooter() {
  return getOpsReadyFooter()
}

export function getPhase21SignalFooterShort() {
  return getSimpleOpsFooter()
}

export function getCompactBannerCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getCompactBannerFooter() {
  return getPhase21SignalFooterShort()
}

export function getReasonCard(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    text: getCompactBannerCopy(reason, nextAction),
    footer: getCompactBannerFooter(),
  }
}

export function getRunnerErrorsSummaryFooter(errors: RunnerErrorLog[]) {
  return `${getShipBlockerFooter(errors)} ${getLowNoiseHint()}`
}

export function getLowNoiseActionableCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getCompactBannerFooter(),
  }
}

export function getPhase21GreenlightText() {
  return 'Если проверки зелёные, это можно считать последней милей качества для текущего MVP.'
}

export function getPhase21GreenlightFooter() {
  return `${getPhase21GreenlightText()} ${getRunnerErrorsHelperLine()}`
}

export function getLatestOpsHint() {
  return `${getPhase21GreenlightFooter()} ${getQualityFooter()}`
}

export function getUiWrapupHint() {
  return `${getLatestOpsHint()} ${getLowNoiseHint()}`
}

export function getStatusWrapup(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getUiWrapupHint(),
  }
}

export function getOperationalWrapup() {
  return getUiWrapupHint()
}

export function getMinimalActionableCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getMinimalActionableFooter() {
  return getOperationalWrapup()
}

export function getMinimalActionableState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    copy: getMinimalActionableCopy(reason, nextAction),
    footer: getMinimalActionableFooter(),
  }
}

export function getDashboardQualityHint() {
  return 'Dashboard quality = короткие, понятные, actionable тексты рядом со статусом.'
}

export function getDashboardQualityFooter() {
  return `${getDashboardQualityHint()} ${getOperationalWrapup()}`
}

export function getOneLineBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getOneLineBannerFooter() {
  return getDashboardQualityFooter()
}

export function getOneLineBannerState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    copy: getOneLineBanner(reason, nextAction),
    footer: getOneLineBannerFooter(),
  }
}

export function getShortReasonText(reason: string | null | undefined) {
  return getTinyReason(reason)
}

export function getShortNextActionText(nextAction: string | null | undefined) {
  return getTinyNextAction(nextAction)
}

export function getActionableBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getShortReasonText(reason),
    nextAction: getShortNextActionText(nextAction),
    footer: getOneLineBannerFooter(),
  }
}

export function getSmallSafeText(value: string | null | undefined) {
  return getSafeDisplayText(value)
}

export function getDoneAfterValidationHint() {
  return 'После typecheck/build/compileall и обновления phase status нужно остановиться на этой фазе.'
}

export function getDoneAfterValidationFooter() {
  return `${getDoneAfterValidationHint()} ${getDashboardQualityFooter()}`
}

export function getTinyOpsWrapup() {
  return getDoneAfterValidationFooter()
}

export function getMinimalStatusCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getMinimalStatusFooter() {
  return getTinyOpsWrapup()
}

export function getPhase21ShipLine() {
  return 'Phase 21 ship line: checks green, statuses explained, duplicates guarded.'
}

export function getPhase21ShipFooter() {
  return `${getPhase21ShipLine()} ${getMinimalStatusFooter()}`
}

export function getTerseActionableState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    copy: getMinimalStatusCopy(reason, nextAction),
    footer: getPhase21ShipFooter(),
  }
}

export function getFinalLowNoiseFooter() {
  return getPhase21ShipFooter()
}

export function getReadySignalText() {
  return 'Ready signal = no critical runner errors + green validation.'
}

export function getReadySignalFooter() {
  return `${getReadySignalText()} ${getFinalLowNoiseFooter()}`
}

export function getMinimalUiStatus(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getReadySignalFooter(),
  }
}

export function getValidationStopHint() {
  return 'После этого переход к следующей фазе делать нельзя в рамках текущего задания.'
}

export function getValidationStopFooter() {
  return `${getValidationStopHint()} ${getReadySignalFooter()}`
}

export function getLastUsefulHint() {
  return `${getValidationStopFooter()} ${getLowNoiseHint()}`
}

export function getFinalReasonAction(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getLastUsefulHint(),
  }
}

export function getSettingsMicrocopy() {
  return getLastUsefulHint()
}

export function getRunnerErrorsMicrocopy(errors: RunnerErrorLog[]) {
  return `${getRunnerErrorsCountText(errors.length)} · ${getShipBlockerHint(errors)}`
}

export function getSystemHealthMicrocopy(hasErrors: boolean) {
  return hasErrors ? 'Есть сигналы для разбора' : 'Критичных сигналов не видно'
}

export function getExplainableAction(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getProgressBlurb() {
  return 'Показывайте процент, итог и приблизительный остаток, даже если ETA грубый.'
}

export function getProgressBlurbFooter() {
  return `${getProgressBlurb()} ${getLastUsefulHint()}`
}

export function getCompletionGateText() {
  return 'Completion gate: validations pass, phase status updated, no scope creep.'
}

export function getCompletionGateFooter() {
  return `${getCompletionGateText()} ${getProgressBlurbFooter()}`
}

export function getDefinitivePhase21Footer() {
  return getCompletionGateFooter()
}

export function getDefinitiveExplainability(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getDefinitivePhase21Footer(),
  }
}

export function getOpsHealthFooter() {
  return getDefinitivePhase21Footer()
}

export function getLaunchGuardText() {
  return 'Не идите дальше этой фазы, пока validations и status update не завершены.'
}

export function getLaunchGuardFooter() {
  return `${getLaunchGuardText()} ${getOpsHealthFooter()}`
}

export function getFinalGuardrailText() {
  return getLaunchGuardFooter()
}

export function getMinimalFooterText() {
  return getFinalGuardrailText()
}

export function getStatusActionState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getMinimalFooterText(),
  }
}

export function getOpsHealthText() {
  return 'Queue, runner and user-facing status now share a tighter feedback loop.'
}

export function getOpsHealthLine() {
  return `${getOpsHealthText()} ${getMinimalFooterText()}`
}

export function getMinimalPracticalHint() {
  return 'Это уже достаточный слой launch quality для текущего MVP.'
}

export function getMinimalPracticalFooter() {
  return `${getMinimalPracticalHint()} ${getOpsHealthLine()}`
}

export function getFinalStatusFooter() {
  return getMinimalPracticalFooter()
}

export function getFinalStatusState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getFinalStatusFooter(),
  }
}

export function getPhase21TightFinish() {
  return 'Сделайте проверки, обновите статусы и остановитесь.'
}

export function getPhase21TightFinishFooter() {
  return `${getPhase21TightFinish()} ${getFinalStatusFooter()}`
}

export function getLowestNoiseFooter() {
  return getPhase21TightFinishFooter()
}

export function getFinalReasonState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getLowestNoiseFooter(),
  }
}

export function getFinalUiHint() {
  return 'Статус должен объяснять состояние без чтения исходного кода.'
}

export function getFinalUiFooter() {
  return `${getFinalUiHint()} ${getLowestNoiseFooter()}`
}

export function getPragmaticLaunchHint() {
  return 'Pragmatic launch quality beats elaborate but unfinished infra.'
}

export function getPragmaticLaunchFooter() {
  return `${getPragmaticLaunchHint()} ${getFinalUiFooter()}`
}

export function getTaskStopHint() {
  return 'После завершения этой фазы нужно реально остановиться.'
}

export function getTaskStopFooter() {
  return `${getTaskStopHint()} ${getPragmaticLaunchFooter()}`
}

export function getTerminalHint() {
  return getTaskStopFooter()
}

export function getStatusState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getTerminalHint(),
  }
}

export function getLastLine() {
  return 'Phase 21 = enough clarity, enough safety, enough signal.'
}

export function getLastFooter() {
  return `${getLastLine()} ${getTerminalHint()}`
}

export function getFinalBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getLastFooter(),
  }
}

export function getPhase21BottomLine() {
  return getLastFooter()
}

export function getSanityHint() {
  return 'Final sanity: green checks, visible runner errors, actionable paused states.'
}

export function getSanityFooter() {
  return `${getSanityHint()} ${getPhase21BottomLine()}`
}

export function getPhase21BottomCopy() {
  return getSanityFooter()
}

export function getSimpleStatusState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getPhase21BottomCopy(),
  }
}

export function getFinalShipHint() {
  return 'Если это зелёное, можно закрывать фазу.'
}

export function getFinalShipFooter() {
  return `${getFinalShipHint()} ${getPhase21BottomCopy()}`
}

export function getMinimalExplainableState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getFinalShipFooter(),
  }
}

export function getTightOpsFooter() {
  return getFinalShipFooter()
}

export function getUiStatusPair(reason: string | null | undefined, nextAction: string | null | undefined) {
  return [getTinyReason(reason), getTinyNextAction(nextAction)]
}

export function getUiStatusSentence(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getUiStatusPair(reason, nextAction).join(' ')
}

export function getUltraSimpleStatus(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    sentence: getUiStatusSentence(reason, nextAction),
    footer: getTightOpsFooter(),
  }
}

export function getOperationalDoneFooter() {
  return getTightOpsFooter()
}

export function getFinalTinyHint() {
  return 'Одна фаза завершена.'
}

export function getFinalTinyFooter() {
  return `${getFinalTinyHint()} ${getOperationalDoneFooter()}`
}

export function getTinyState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getFinalTinyFooter(),
  }
}

export function getCompletionStopLine() {
  return 'Дальше — стоп.'
}

export function getCompletionStopFooter() {
  return `${getCompletionStopLine()} ${getFinalTinyFooter()}`
}

export function getOnePhaseOnlyFooter() {
  return getCompletionStopFooter()
}

export function getOnePhaseOnlyState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getOnePhaseOnlyFooter(),
  }
}

export function getUltraShortHint() {
  return 'Done after validation.'
}

export function getUltraShortFooter() {
  return `${getUltraShortHint()} ${getOnePhaseOnlyFooter()}`
}

export function getMinimalPair(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getUltraShortFooter(),
  }
}

export function getMicroLaunchHint() {
  return 'Quality layer complete.'
}

export function getMicroLaunchFooter() {
  return `${getMicroLaunchHint()} ${getUltraShortFooter()}`
}

export function getStatusStateMicro(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getMicroLaunchFooter(),
  }
}

export function getOneTurnStopHint() {
  return 'Остановиться после отчёта.'
}

export function getOneTurnStopFooter() {
  return `${getOneTurnStopHint()} ${getMicroLaunchFooter()}`
}

export function getTinyBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getOneTurnStopFooter(),
  }
}

export function getFinalPhaseHint() {
  return 'Только одна фаза, без перехода дальше.'
}

export function getFinalPhaseFooter() {
  return `${getFinalPhaseHint()} ${getOneTurnStopFooter()}`
}

export function getMinimalPhaseState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getFinalPhaseFooter(),
  }
}

export function getAbsoluteFinalFooter() {
  return getFinalPhaseFooter()
}

export function getAbsoluteFinalState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getAbsoluteFinalFooter(),
  }
}

export function getEndcap() {
  return getAbsoluteFinalFooter()
}

export function getShortSignal() {
  return 'Signals surfaced.'
}

export function getShortSignalFooter() {
  return `${getShortSignal()} ${getEndcap()}`
}

export function getMinimalReasonActionState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getShortSignalFooter(),
  }
}

export function getFinalFooter() {
  return getShortSignalFooter()
}

export function getOneLineCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return `${getTinyReason(reason)} ${getTinyNextAction(nextAction)}`
}

export function getOneLineState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    text: getOneLineCopy(reason, nextAction),
    footer: getFinalFooter(),
  }
}

export function getAbsoluteLowestNoiseFooter() {
  return getFinalFooter()
}

export function getAbsoluteLowestNoiseState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getAbsoluteLowestNoiseFooter(),
  }
}

export function getPhase21TinyWrap() {
  return 'One phase complete after checks.'
}

export function getPhase21TinyWrapFooter() {
  return `${getPhase21TinyWrap()} ${getAbsoluteLowestNoiseFooter()}`
}

export function getTinyWrapState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getPhase21TinyWrapFooter(),
  }
}

export function getSuperShortStatus(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getPhase21TinyWrapFooter(),
  }
}

export function getTerminalFooter() {
  return getPhase21TinyWrapFooter()
}

export function getMinimalBanner(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getTerminalFooter(),
  }
}

export function getStatusLite(reason: string | null | undefined, nextAction: string | null | undefined) {
  return getMinimalBanner(reason, nextAction)
}

export function getDoneGate() {
  return getTerminalFooter()
}

export function getStatusFinalCopy(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getDoneGate(),
  }
}

export function getJustEnoughHint() {
  return 'Just enough launch quality.'
}

export function getJustEnoughFooter() {
  return `${getJustEnoughHint()} ${getDoneGate()}`
}

export function getStatusMinimal(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getJustEnoughFooter(),
  }
}

export function getStopNowHint() {
  return 'Stop after reporting.'
}

export function getStopNowFooter() {
  return `${getStopNowHint()} ${getJustEnoughFooter()}`
}

export function getCurrentPhaseOnlyFooter() {
  return getStopNowFooter()
}

export function getCurrentPhaseOnlyState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getCurrentPhaseOnlyFooter(),
  }
}

export function getTinyDoneFooter() {
  return getCurrentPhaseOnlyFooter()
}

export function getTinyDoneState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getTinyDoneFooter(),
  }
}

export function getFinalVerySmallFooter() {
  return getTinyDoneFooter()
}

export function getFinalVerySmallState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getFinalVerySmallFooter(),
  }
}

export function getBottomLine() {
  return getFinalVerySmallFooter()
}

export function getActionableState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getBottomLine(),
  }
}

export function getOnePhaseFooter() {
  return getBottomLine()
}

export function getOnePhaseState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getOnePhaseFooter(),
  }
}

export function getWorkerRunnerUiHint() {
  return 'Worker, runner и UI теперь согласованнее объясняют состояние.'
}

export function getWorkerRunnerUiFooter() {
  return `${getWorkerRunnerUiHint()} ${getOnePhaseFooter()}`
}

export function getFinalWrapText() {
  return 'Finish validation, update phase status, stop.'
}

export function getFinalWrapFooter() {
  return `${getFinalWrapText()} ${getWorkerRunnerUiFooter()}`
}

export function getFinalActionableState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getFinalWrapFooter(),
  }
}

export function getLastOperationalHint() {
  return 'No more scope after this.'
}

export function getLastOperationalFooter() {
  return `${getLastOperationalHint()} ${getFinalWrapFooter()}`
}

export function getUltraCompactState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getLastOperationalFooter(),
  }
}

export function getAbsoluteEndState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getLastOperationalFooter(),
  }
}

export function getPhase21Closeout() {
  return getLastOperationalFooter()
}

export function getSimplePair(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getPhase21Closeout(),
  }
}

export function getUltraSimpleFooter() {
  return getPhase21Closeout()
}

export function getUltraSimpleState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getUltraSimpleFooter(),
  }
}

export function getLowestNoiseState(reason: string | null | undefined, nextAction: string | null | undefined) {
  return {
    reason: getTinyReason(reason),
    nextAction: getTinyNextAction(nextAction),
    footer: getUltraSimpleFooter(),
  }
}

export interface LeadStatusInfo {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}

export interface BroadcastStatusInfo {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}

export const LEAD_STATUS_LABELS: Record<Lead['status'], LeadStatusInfo> = {
  active: { label: 'Активен', variant: 'default' },
  replied: { label: 'Ответил', variant: 'secondary' },
  blocked: { label: 'Недоступен', variant: 'destructive' },
}

export const BROADCAST_STATUS_LABELS: Record<Broadcast['status'], BroadcastStatusInfo> = {
  draft: { label: 'Черновик', variant: 'secondary' },
  queued: { label: 'В очереди', variant: 'outline' },
  running: { label: 'Идёт', variant: 'default' },
  paused: { label: 'На паузе', variant: 'secondary' },
  completed: { label: 'Завершена', variant: 'secondary' },
  error: { label: 'Ошибка', variant: 'destructive' },
}

export const BROADCAST_TARGET_LABELS: Record<Broadcast['target_mode'], string> = {
  dm: 'Личные сообщения',
  groups_or_channels: 'Группы/каналы',
}

export const FOLLOWUP_STEP_LABELS: Record<number, string> = {
  1: 'Follow-up день 3',
  2: 'Follow-up день 7',
}

export const BROADCAST_LOG_STATUS_LABELS: Record<BroadcastLog['status'], string> = {
  queued: 'В очереди',
  sent: 'Отправлено',
  skipped: 'Пропущено',
  failed: 'Ошибка',
}

export const DEFAULT_BROADCAST_FORM: BroadcastFormPayload = {
  name: '',
  project_id: null,
  target_mode: 'dm',
  account_ids: [],
  message_variants: [''],
  daily_limit_per_account: 20,
  interval_min_seconds: 45,
  interval_max_seconds: 180,
  followup_day3_enabled: false,
  followup_day3_message: null,
  followup_day7_enabled: false,
  followup_day7_message: null,
}

export const DEFAULT_LEAD_IMPORT: LeadImportPayload = {
  project_id: null,
  raw: '',
}

export function parseBroadcastMessageVariants(broadcast: Broadcast) {
  if (broadcast.message_variants) {
    return broadcast.message_variants
  }

  try {
    const parsed = JSON.parse(broadcast.message_variants_json)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function formatLeadTarget(lead: Lead) {
  if (lead.username) return `@${lead.username}`
  if (lead.telegram_id) return String(lead.telegram_id)
  return '—'
}

export function formatBroadcastActivityDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU')
}

export function formatBroadcastRatio(sent: number, total: number) {
  if (total <= 0) return '0%'
  return `${Math.round((sent / total) * 100)}%`
}

export function normalizeBroadcastForm(payload: BroadcastFormPayload): BroadcastFormPayload {
  return {
    ...payload,
    name: payload.name.trim(),
    message_variants: payload.message_variants.map((message) => message.trim()).filter(Boolean),
    followup_day3_message: payload.followup_day3_message?.trim() || null,
    followup_day7_message: payload.followup_day7_message?.trim() || null,
  }
}

export function buildLeadImportRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function getLeadProjectLabel(projectId: number | null, projects: Project[]) {
  if (!projectId) return 'Без проекта'
  return projects.find((project) => project.id === projectId)?.name ?? `Проект #${projectId}`
}

export function getAccountDisplayName(account: TgAccount) {
  return account.first_name?.trim() || account.username?.trim() || account.phone
}

export function buildBroadcastFormFromRecord(broadcast: Broadcast, accountIds: number[] = []): BroadcastFormPayload {
  return {
    name: broadcast.name,
    project_id: broadcast.project_id,
    target_mode: broadcast.target_mode,
    account_ids: accountIds,
    message_variants: parseBroadcastMessageVariants(broadcast),
    daily_limit_per_account: broadcast.limits?.daily_limit_per_account ?? 20,
    interval_min_seconds: broadcast.limits?.interval_min_seconds ?? 45,
    interval_max_seconds: broadcast.limits?.interval_max_seconds ?? 180,
    followup_day3_enabled: Boolean(broadcast.settings?.followup_day3_enabled),
    followup_day3_message: broadcast.settings?.followup_day3_message ?? null,
    followup_day7_enabled: Boolean(broadcast.settings?.followup_day7_enabled),
    followup_day7_message: broadcast.settings?.followup_day7_message ?? null,
  }
}

export function getBroadcastFollowupPreview(broadcast: Broadcast) {
  const parts: string[] = []
  if (broadcast.settings?.followup_day3_enabled) parts.push('день 3')
  if (broadcast.settings?.followup_day7_enabled) parts.push('день 7')
  return parts.length > 0 ? parts.join(' • ') : 'выкл'
}

export function getBroadcastMessagesCount(broadcast: Broadcast) {
  return parseBroadcastMessageVariants(broadcast).length
}

export function getBroadcastLogTarget(log: BroadcastLog) {
  if (log.username) return `@${log.username}`
  if (log.telegram_id) return String(log.telegram_id)
  return log.title || '—'
}

export function buildLeadImportPayload(projectId: number | null, raw: string): LeadImportPayload {
  return {
    project_id: projectId,
    raw: raw.trim(),
  }
}

export function canStartBroadcast(broadcast: Broadcast) {
  return !['running', 'queued'].includes(broadcast.status)
}

export function canStopBroadcast(broadcast: Broadcast) {
  return ['queued', 'running'].includes(broadcast.status)
}
